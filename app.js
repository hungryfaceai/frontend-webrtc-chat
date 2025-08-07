const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isSpeakerMuted = false;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteButton = document.getElementById('muteButton');
const cameraButton = document.getElementById('cameraButton');
const speakerButton = document.getElementById('speakerButton');
const volumeControls = document.getElementById('volumeControls');

const audioContexts = []; // Store all per-audio-track gain controls

document.getElementById('startButton').onclick = async () => {
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  await startLocalStream();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
  console.log("📞 Offer sent");
};

muteButton.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
  console.log(audioTrack.enabled ? "🎤 Mic unmuted" : "🔇 Mic muted");
};

cameraButton.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  videoTrack.enabled = !videoTrack.enabled;
  cameraButton.textContent = videoTrack.enabled ? 'Turn Camera Off' : 'Turn Camera On';
  console.log(videoTrack.enabled ? "🎥 Camera on" : "📷 Camera off");
};

speakerButton.onclick = () => {
  isSpeakerMuted = !isSpeakerMuted;
  audioContexts.forEach(ctx => {
    ctx.gainNode.gain.value = isSpeakerMuted ? 0 : ctx.slider.value;
  });

  speakerButton.textContent = isSpeakerMuted ? 'Unmute Speakers' : 'Mute Speakers';
  console.log(isSpeakerMuted ? "🔈 Speakers muted" : "🔊 Speakers unmuted");
};

socket.onmessage = async (event) => {
  let data;

  if (event.data instanceof Blob) {
    const text = await event.data.text();
    data = JSON.parse(text);
  } else {
    data = JSON.parse(event.data);
  }

  console.log("📩 Received message:", data);

  if (data.type === 'offer' && !isCaller) {
    console.log("📩 Processing offer");
    await startLocalStream();
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendMessage({ type: 'answer', sdp: answer.sdp });
    console.log("📤 Answer sent");
  }

  if (data.type === 'answer' && isCaller) {
    console.log("📩 Received answer");
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
  }

  if (data.type === 'candidate') {
    console.log("🧊 ICE candidate received:", data.candidate);
    try {
      const candidate = new RTCIceCandidate(data.candidate);
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error("❌ ICE error", err);
    }
  }
};

peerConnection.onicecandidate = event => {
  if (event.candidate) {
    sendMessage({ type: 'candidate', candidate: event.candidate });
  }
};

peerConnection.ontrack = event => {
  const [stream] = event.streams;
  remoteVideo.srcObject = stream;

  remoteVideo.onloadedmetadata = () => {
    remoteVideo.play().catch(err => {
      console.warn("⚠️ Auto-play error:", err);
      document.addEventListener("click", () => remoteVideo.play());
    });
  };

  console.log("📡 Remote stream received");

  if (event.track.kind === 'audio') {
    setupAudioControl(stream);
  }
};

function sendMessage(message) {
  socket.send(JSON.stringify(message));
}

async function startLocalStream() {
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      console.log("🎥 Local stream started");
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = true;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = true;

    muteButton.disabled = false;
    cameraButton.disabled = false;
    speakerButton.disabled = false;
  } catch (err) {
    console.error("❌ Error accessing media devices:", err);
  }
}

function setupAudioControl(stream) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const gainNode = audioContext.createGain();
  source.connect(gainNode).connect(audioContext.destination);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = 1;
  slider.oninput = () => {
    gainNode.gain.value = isSpeakerMuted ? 0 : slider.value;
  };

  const label = document.createElement('label');
  label.textContent = '🔊 Volume: ';
  label.appendChild(slider);

  volumeControls.appendChild(label);

  audioContexts.push({ audioContext, gainNode, slider });
}
