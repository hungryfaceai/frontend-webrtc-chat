const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com'; // <-- Your live URL
const socket = new WebSocket(SIGNALING_SERVER_URL);

let localStream;
let isCaller = false;
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

document.getElementById('startButton').onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  console.log("🎥 Local stream started");
};

document.getElementById('callButton').onclick = async () => {
  isCaller = true;
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
  console.log("📞 Offer sent");
};

socket.onmessage = async (event) => {
  const message = JSON.parse(event.data);
  console.log("📩 Received message:", message);

  if (message.type === 'offer' && !isCaller) {
    console.log("📩 Processing offer");
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendMessage({ type: 'answer', sdp: answer.sdp });
    console.log("📤 Answer sent");
  }

  if (message.type === 'answer' && isCaller) {
    console.log("📩 Received answer");
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
  }

  if (message.type === 'candidate') {
    console.log("🧊 ICE candidate received:", message.candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
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
  if (!remoteVideo.srcObject) {
    remoteVideo.srcObject = event.streams[0];
    console.log("📡 Remote stream received");
  }
};

function sendMessage(message) {
  socket.send(JSON.stringify(message));
}
