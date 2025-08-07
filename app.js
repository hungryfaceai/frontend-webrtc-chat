const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com';
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
let isMicMuted = false;
let isCameraOff = false;

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

document.getElementById('startButton').onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    console.log("🎥 Local stream started");
  } catch (err) {
    console.error("❌ Error accessing media devices:", err);
  }
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
  console.log("📞 Offer sent");
};

// Mute/Unmute Microphone
document.getElementById('muteButton').onclick = () => {
  if (!localStream) return;

  isMicMuted = !isMicMuted;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMicMuted;
  });

  document.getElementById('muteButton').textContent = isMicMuted ? 'Unmute Mic' : 'Mute Mic';
  console.log(isMicMuted ? "🔇 Mic muted" : "🎤 Mic unmuted");
};

// Turn Camera On/Off
document.getElementById('cameraButton').onclick = () => {
  if (!localStream) return;

  isCameraOff = !isCameraOff;

  localStream.getVideoTracks().forEach(track => {
    track.enabled = !isCameraOff;
  });

  document.getElementById('cameraButton').textContent = isCameraOff ? 'Turn Camera On' : 'Turn Camera Off';
  console.log(isCameraOff ? "📷 Camera off" : "🎥 Camera on");
};

// Handle incoming WebSocket messages (with Blob fix for iOS)
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
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      console.log("🎥 Local stream started (late)");
    }

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

// Send local ICE candidates to peer
peerConnection.onicecandidate = event => {
  if (event.candidate) {
    sendMessage({ type: 'candidate', candidate: event.candidate });
  }
};

// Display remote stream
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

// Helper function to send messages to signaling server
function sendMessage(message) {
  socket.send(JSON.stringify(message));
}
