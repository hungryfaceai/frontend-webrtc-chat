const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteButton = document.getElementById('muteButton');
const cameraButton = document.getElementById('cameraButton');

document.getElementById('startButton').onclick = async () => {
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  await startLocalStream(); // Ensure tracks are added before offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
  console.log("📞 Offer sent");
};

muteButton.onclick = () => {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    console.warn("⚠️ No audio track found to mute/unmute.");
    return;
  }

  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
  console.log(audioTrack.enabled ? "🎤 Mic unmuted" : "🔇 Mic muted");
};

cameraButton.onclick = () => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) {
    console.warn("⚠️ No video track found to toggle.");
    return;
  }

  videoTrack.enabled = !videoTrack.enabled;
  cameraButton.textContent = videoTrack.enabled ? 'Turn Camera Off' : 'Turn Camera On';
  console.log(videoTrack.enabled ? "🎥 Camera on" : "📷 Camera off");
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
    remoteVideo
      .play()
      .then(() => console.log("▶️ Remote video playing"))
      .catch(err => {
        console.warn("⚠️ Auto-play error:", err);
        document.addEventListener("click", () => remoteVideo.play());
      });
  };

  console.log("📡 Remote stream received");
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

    // Ensure audio and video start unmuted
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = true;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = true;

    muteButton.disabled = false;
    cameraButton.disabled = false;
  } catch (err) {
    console.error("❌ Error accessing media devices:", err);
  }
}
