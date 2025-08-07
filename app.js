const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);
let isSocketOpen = false;

socket.onopen = () => {
  isSocketOpen = true;
  console.log("✅ WebSocket connected");
};

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
const fullscreenButton = document.getElementById('fullscreenButton');
const musicButton = document.getElementById('musicButton');
const loopButton = document.getElementById('loopButton');
const volumeSlider = document.getElementById('volumeSlider');
const trackSelect = document.getElementById('trackSelect');

let musicAudio = null;
let musicTrack = null;
let musicContext = null;

document.getElementById('startButton').onclick = async () => {
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  if (!isSocketOpen) {
    alert("Please wait: signaling server not connected.");
    return;
  }

  isCaller = true;
  await startLocalStream();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
  console.log("📞 Offer sent");

  setMicEnabled(false);
  muteButton.textContent = 'Unmute Mic';

  isSpeakerMuted = false;
  remoteVideo.muted = false;
  speakerButton.textContent = 'Mute Speakers';
};

muteButton.onclick = () => {
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
};

cameraButton.onclick = () => {
  const videoTrack = localStream?.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  cameraButton.textContent = videoTrack.enabled ? 'Turn Camera Off' : 'Turn Camera On';
};

speakerButton.onclick = () => {
  isSpeakerMuted = !isSpeakerMuted;
  remoteVideo.muted = isSpeakerMuted;
  speakerButton.textContent = isSpeakerMuted ? 'Unmute Speakers' : 'Mute Speakers';
};

fullscreenButton.onclick = () => {
  if (remoteVideo.requestFullscreen) {
    remoteVideo.requestFullscreen();
  } else if (remoteVideo.webkitRequestFullscreen) {
    remoteVideo.webkitRequestFullscreen();
  } else if (remoteVideo.msRequestFullscreen) {
    remoteVideo.msRequestFullscreen();
  }
};

musicButton.onclick = async () => {
  if (musicAudio && !musicAudio.paused) {
    musicAudio.pause();
    musicAudio.currentTime = 0;

    if (musicTrack) {
      peerConnection.getSenders().forEach(sender => {
        if (sender.track === musicTrack) {
          peerConnection.removeTrack(sender);
        }
      });
    }

    musicButton.textContent = 'Play Music to Callee';
    return;
  }

  try {
    const selectedUrl = trackSelect.value;

    musicAudio = new Audio(selectedUrl);
    musicAudio.crossOrigin = 'anonymous';
    musicAudio.loop = loopButton.textContent === 'Disable Loop';
    musicAudio.volume = volumeSlider.value;

    await musicAudio.play();

    musicContext = new AudioContext();
    const source = musicContext.createMediaElementSource(musicAudio);
    const destination = musicContext.createMediaStreamDestination();
    source.connect(destination);
    source.connect(musicContext.destination);

    musicTrack = destination.stream.getAudioTracks()[0];
    peerConnection.addTrack(musicTrack, destination.stream);

    musicButton.textContent = 'Stop Music';
    console.log("🎵 Streaming music to callee");
  } catch (err) {
    console.error("❌ Music playback failed:", err);
  }
};

loopButton.onclick = () => {
  if (!musicAudio) return;
  musicAudio.loop = !musicAudio.loop;
  loopButton.textContent = musicAudio.loop ? 'Disable Loop' : 'Enable Loop';
};

volumeSlider.oninput = () => {
  if (musicAudio) {
    musicAudio.volume = volumeSlider.value;
  }
};

socket.onmessage = async (event) => {
  let data;
  if (event.data instanceof Blob) {
    const text = await event.data.text();
    data = JSON.parse(text);
  } else {
    data = JSON.parse(event.data);
  }

  if (data.type === 'offer' && !isCaller) {
    await startLocalStream();
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendMessage({ type: 'answer', sdp: answer.sdp });

    setMicEnabled(true);
    muteButton.textContent = 'Mute Mic';

    isSpeakerMuted = false;
    remoteVideo.muted = false;
    speakerButton.textContent = 'Mute Speakers';
  }

  if (data.type === 'answer' && isCaller) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
  }

  if (data.type === 'candidate') {
    try {
      const candidate = new RTCIceCandidate(data.candidate);
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error("❌ ICE error", err);
    }
  }
};

peerConnection.onicecandidate = event => {
  if (event.candidate && isSocketOpen) {
    sendMessage({ type: 'candidate', candidate: event.candidate });
  }
};

peerConnection.ontrack = event => {
  const [stream] = event.streams;
  remoteVideo.srcObject = stream;

  remoteVideo.onloadedmetadata = () => {
    remoteVideo.muted = isSpeakerMuted;
    remoteVideo.play().catch(err => {
      console.warn("⚠️ Auto-play error:", err);
      document.addEventListener("click", () => remoteVideo.play());
    });
  };

  fullscreenButton.disabled = false;
  console.log("📡 Remote stream received");
};

function sendMessage(message) {
  if (isSocketOpen) {
    socket.send(JSON.stringify(message));
  } else {
    console.warn("⚠️ WebSocket not ready. Message not sent:", message);
  }
}

function setMicEnabled(enabled) {
  const track = localStream?.getAudioTracks()[0];
  if (track) track.enabled = enabled;
}

async function startLocalStream() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  muteButton.disabled = false;
  cameraButton.disabled = false;
  speakerButton.disabled = false;
  musicButton.disabled = false;
  loopButton.disabled = false;
  volumeSlider.disabled = false;
  trackSelect.disabled = false;
}
