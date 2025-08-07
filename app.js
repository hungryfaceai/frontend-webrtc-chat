const SIGNALING_SERVER_URL = 'wss://signaling-server-f5gu.onrender.com'; // <-- Replace this
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const socket = new WebSocket(SIGNALING_SERVER_URL);
let localStream;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

document.getElementById('startButton').onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  localVideo.srcObject = localStream;
};

document.getElementById('callButton').onclick = async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: 'offer', sdp: offer.sdp });
};

socket.onmessage = async (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendMessage({ type: 'answer', sdp: answer.sdp });
  }

  else if (message.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
  }

  else if (message.type === 'candidate') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    } catch (err) {
      console.error('Error adding received ICE candidate', err);
    }
  }
};

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    sendMessage({ type: 'candidate', candidate: event.candidate });
  }
};

peerConnection.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

function sendMessage(msg) {
  socket.send(JSON.stringify(msg));
}
