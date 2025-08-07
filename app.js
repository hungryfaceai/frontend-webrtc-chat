const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isSpeakerMuted = false;
let currentVideoDeviceId = null;

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
  await populateCameraOptions();
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  await populateCameraOptions();
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
  try {
    const audioUrl = 'https://raw.githubusercontent.com/hungryfaceai/frontend-webrtc-chat/main/lullaby/lullaby-baby-sleep-music-331777.mp3';

    const audio = new Audio(audioUrl);
    audio.crossOrigin = 'anonymous';
    audio.loop = false;
    await audio.play();

    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioContext.destination);

    const musicTrack = destination.stream.getAudioTracks()[0];
    peerConnection.addTrack(musicTrack, destination.stream);

    console.log("🎵 Streaming music to callee");
  } catch (err) {
    console.error("❌ Music playback failed:", err);
  }
};

cameraSelect.onchange = async () => {
  currentVideoDeviceId = cameraSelect.value;
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
    await populateCameraOptions();
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

  const constraints = {
    audio: true,
    video: currentVideoDeviceId
      ? { deviceId: { exact: currentVideoDeviceId } }
      : { facingMode: { ideal: 'environment' } }
  };

  localStream = await navigator.mediaDevices.getUserMedia(constraints);
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

async function populateCameraOptions() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');

  cameraSelect.innerHTML = '';
  videoDevices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `Camera ${cameraSelect.length + 1}`;
    cameraSelect.appendChild(option);
  });

  const backCam = videoDevices.find(device =>
    device.label.toLowerCase().includes('back') ||
    device.label.toLowerCase().includes('environment')
  );

  if (backCam) {
    currentVideoDeviceId = backCam.deviceId;
    cameraSelect.value = backCam.deviceId;
  } else {
    currentVideoDeviceId = videoDevices[0]?.deviceId || null;
    cameraSelect.value = currentVideoDeviceId;
  }
}
