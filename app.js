const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com'; // Replace with your signaling server
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;

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
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
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

  // Force autoplay for iOS
  remoteVideo.onloadedmetadata = () => {
    remoteVideo.play().catch(err => console.warn("⚠️ Auto-play error:", err));
  };

  console.log("📡 Remote stream received");
};

// Helper function to send messages to signaling server
function sendMessage(message) {
  socket.send(JSON.stringify(message));
}
