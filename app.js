const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isSpeakerMuted = false;
let musicAudio = null;
let musicSource = null;
let musicStream = null;
let musicTrackSender = null;

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
const cameraSelect = document.getElementById('cameraSelect');

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
  if (!musicAudio) {
    try {
      const audioUrl = 'https://raw.githubusercontent.com/hungryfaceai/frontend-webrtc-chat/main/lullaby/lullaby-baby-sleep-music-331777.mp3';

      musicAudio = new Audio(audioUrl);
      musicAudio.crossOrigin = 'anonymous';
      musicAudio.loop = true;
      await musicAudio.play();

      const audioContext = new AudioContext();
      musicSource = audioContext.createMediaElementSource(musicAudio);
      const destination = audioContext.createMediaStreamDestination();
      musicSource.connect(destination);
      musicSource.connect(audioContext.destination);

      musicStream = destination.stream;
      const musicTrack = musicStream.getAudioTracks()[0];
      musicTrackSender = peerConnection.addTrack(musicTrack, musicStream);

      musicButton.textContent = 'Stop Music';
      console.log("🎵 Music started and streaming to callee");
    } catch (err) {
      console.error("❌ Music playback failed:", err);
      musicAudio = null;
    }
  } else {
    musicAudio.pause();
    musicAudio.currentTime = 0;
    musicAudio = null;

    if (musicTrackSender) {
      peerConnection.removeTrack(musicTrackSender);
      musicTrackSender = null;
    }

    if (musicStream) {
      musicStream.getTracks().forEach(track => track.stop());
      musicStream = null;
    }

    musicButton.textContent = 'Play Music to Baby';
    console.log("🛑 Music stopped");
  }
};

cameraSelect.onchange = async () => {
  await startLocalStream();
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
  if (event.candidate) {
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
  socket.send(JSON.stringify(message));
}

function setMicEnabled(enabled) {
  const track = localStream?.getAudioTracks()[0];
  if (track) track.enabled = enabled;
}

async function startLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  const facingMode = cameraSelect.value || 'environment'; // Default to back camera
  const constraints = {
    audio: true,
    video: { facingMode: { exact: facingMode } }
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.error("❌ getUserMedia error:", err);
    return;
  }

  localVideo.srcObject = localStream;

  const senders = peerConnection.getSenders();
  localStream.getTracks().forEach(track => {
    const sender = senders.find(s => s.track && s.track.kind === track.kind);
    if (sender) {
      sender.replaceTrack(track);
    } else {
      peerConnection.addTrack(track, localStream);
    }
  });

  muteButton.disabled = false;
  cameraButton.disabled = false;
  speakerButton.disabled = false;
  musicButton.disabled = false;
}
