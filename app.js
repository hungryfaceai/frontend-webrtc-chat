const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isSpeakerMuted = false;
let videoDevices = [];
let currentCameraIndex = 0;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteButton = document.getElementById('muteButton');
const cameraButton = document.getElementById('cameraButton');
const speakerButton = document.getElementById('speakerButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const switchCameraButton = document.getElementById('switchCameraButton');

document.getElementById('startButton').onclick = async () => {
  await startLocalStream();
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  await startLocalStream();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });

  setMicEnabled(false);
  muteButton.textContent = '🎙️ Unmute';
  isSpeakerMuted = false;
  remoteVideo.muted = false;
  speakerButton.textContent = '🔈 Mute';
};

muteButton.onclick = () => {
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  muteButton.textContent = audioTrack.enabled ? '🎙️ Mute' : '🎙️ Unmute';
};

cameraButton.onclick = () => {
  const videoTrack = localStream?.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  cameraButton.textContent = videoTrack.enabled ? '📷 Off' : '📷 On';
};

speakerButton.onclick = () => {
  isSpeakerMuted = !isSpeakerMuted;
  remoteVideo.muted = isSpeakerMuted;
  speakerButton.textContent = isSpeakerMuted ? '🔈 Unmute' : '🔈 Mute';
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

switchCameraButton.onclick = async () => {
  if (videoDevices.length < 2) return;

  const oldTrack = localStream.getVideoTracks()[0];
  if (oldTrack) {
    oldTrack.stop();
    peerConnection.getSenders().forEach(sender => {
      if (sender.track === oldTrack) {
        peerConnection.removeTrack(sender);
      }
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

  switchCameraButton.title = videoDevices[currentCameraIndex].label || "Switch Camera";
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
    muteButton.textContent = '🎙️ Mute';
    isSpeakerMuted = false;
    remoteVideo.muted = false;
    speakerButton.textContent = '🔈 Mute';
  }

  if (data.type === 'answer' && isCaller) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
  }

  if (data.type === 'candidate') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
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
};

function sendMessage(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function setMicEnabled(enabled) {
  const track = localStream?.getAudioTracks()[0];
  if (track) track.enabled = enabled;
}

async function startLocalStream() {
  if (!localStream) {
    const initialStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter(d => d.kind === 'videoinput');

    const backCamera = videoDevices.find(device =>
      device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment')
    );

    currentCameraIndex = videoDevices.indexOf(backCamera) !== -1
      ? videoDevices.indexOf(backCamera)
      : 0;

    const selectedDeviceId = videoDevices[currentCameraIndex]?.deviceId;

    if (selectedDeviceId) {
      initialStream.getTracks().forEach(track => track.stop());
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDeviceId } },
        audio: true
      });
    } else {
      localStream = initialStream;
    }

    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  muteButton.disabled = false;
  cameraButton.disabled = false;
  speakerButton.disabled = false;
  fullscreenButton.disabled = false;
  switchCameraButton.disabled = videoDevices.length < 2;
}
