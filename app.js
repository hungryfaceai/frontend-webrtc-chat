const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isSpeakerMuted = false;
let musicAudio = null;
let musicTrack = null;
let musicContext = null;

let isSocketOpen = false;
let videoDevices = [];
let currentCameraIndex = 0;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteButton = document.getElementById('muteButton');
const cameraButton = document.getElementById('cameraButton');
const switchCameraButton = document.getElementById('switchCameraButton');
const speakerButton = document.getElementById('speakerButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const musicButton = document.getElementById('musicButton');
const loopButton = document.getElementById('loopButton');
const volumeSlider = document.getElementById('volumeSlider');
const trackSelect = document.getElementById('trackSelect');

socket.onopen = () => {
  isSocketOpen = true;
  console.log("✅ WebSocket connected");
};

document.getElementById('startButton').onclick = async () => {
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  if (!isSocketOpen) {
    alert("Please wait: WebSocket not connected");
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

switchCameraButton.onclick = async () => {
  if (videoDevices.length < 2) return;

  const oldTrack = localStream.getVideoTracks()[0];
  if (oldTrack) {
    oldTrack.stop();
    peerConnection.getSenders().forEach(sender => {
      if (sender.track === oldTrack) peerConnection.removeTrack(sender);
    });
  }

  currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;
  const newDeviceId = videoDevices[currentCameraIndex].deviceId;

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: newDeviceId } },
    audio: false
  });

  const newTrack = newStream.getVideoTracks()[0];
  localStream.removeTrack(oldTrack);
  localStream.addTrack(newTrack);
  peerConnection.addTrack(newTrack, localStream);
  localVideo.srcObject = localStream;
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
    // source.connect(musicContext.destination); // Optional: remove local playback
    musicTrack = destination.stream.getAudioTracks()[0];
    peerConnection.addTrack(musicTrack, destination.stream);

    musicButton.textContent = 'Stop Music';
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
  if (musicAudio) musicAudio.volume = volumeSlider.value;
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
      document.addEventListener("click", () => remoteVideo.play());
    });
  };
  fullscreenButton.disabled = false;
};

function sendMessage(message) {
  if (isSocketOpen) {
    socket.send(JSON.stringify(message));
  } else {
    console.warn("❌ WebSocket not ready, message not sent:", message);
  }
}

function setMicEnabled(enabled) {
  const track = localStream?.getAudioTracks()[0];
  if (track) track.enabled = enabled;
}

async function startLocalStream() {
  if (!localStream) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter(d => d.kind === 'videoinput');

    const backCamera = videoDevices.find(device =>
      device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment')
    );
    currentCameraIndex = videoDevices.indexOf(backCamera) !== -1 ? videoDevices.indexOf(backCamera) : 0;

    const selectedDeviceId = videoDevices[currentCameraIndex]?.deviceId;

    localStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
      audio: true
    });

    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  muteButton.disabled = false;
  cameraButton.disabled = false;
  switchCameraButton.disabled = videoDevices.length > 1 ? false : true;
  speakerButton.disabled = false;
  musicButton.disabled = false;
  loopButton.disabled = false;
  volumeSlider.disabled = false;
  trackSelect.disabled = false;
}
