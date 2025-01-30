let localStream;
let userId;
const peerConnections = new Map();

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

let constraints = {
  video: {
    width: { min: 640, ideal: 1920, max: 1920 },
    height: { min: 480, ideal: 1080, max: 1080 },
  },
  audio: { echoCancellation: true },
};

async function startVideo() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("localVideo").srcObject = localStream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
}

function initializeUser() {
  userId = document.getElementById("userId").value;
  if (!userId) {
    alert("Please enter a user ID");
    return;
  }
  document.querySelector(".user-label").textContent = userId;
}

function createVideoElement(peerID) {
  const videoContainer = document.createElement("div");
  videoContainer.className = "video-container";
  videoContainer.id = `container-${peerID}`;

  const video = document.createElement("video");
  video.id = `video-${peerID}`;
  video.autoplay = true;
  video.playsInline = true;

  const label = document.createElement("div");
  label.className = "user-label";
  label.textContent = peerID;

  videoContainer.appendChild(video);
  videoContainer.appendChild(label);
  document.querySelector(".videos").appendChild(videoContainer);

  return video;
}

function initPeerConnection(peerId) {
  const peerConnection = new RTCPeerConnection(servers);
  peerConnections.set(peerId, peerConnection);

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      let videoElement = document.getElementById(`video-${peerId}`);
      if (!videoElement) {
        videoElement = createVideoElement(peerId);
      }
      videoElement.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate === null) {
      const sdpTextarea = document.getElementById("offerSdp").value
        ? document.getElementById("offerSdp")
        : document.getElementById("answerSdp");
      sdpTextarea.value = peerConnection.localDescription.sdp;
    }
    if (event.candidate) {
      // Make sure we're passing the correct properties
      const candidate = new Candidate(
        event.candidate.candidate,
        event.candidate.sdpMid,
        event.candidate.sdpMLineIndex
      );

      sendEvent(
        "ice_candidate",
        new CandidateEvent("ice_candidate", userId, peerId, candidate)
      );
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      `ICE Connection State with ${peerId}:`,
      peerConnection.iceConnectionState
    );
    if (
      peerConnection.iceConnectionState === "disconnected" ||
      peerConnection.iceConnectionState === "failed" ||
      peerConnection.iceConnectionState === "closed"
    ) {
      removeConnection(peerId);
    }
  };

  return peerConnection;
}

function removeConnection(peerId) {
  const container = document.getElementById(`container-${peerId}`);
  if (container) {
    container.remove();
  }

  const peerConnection = peerConnections.get(peerId);
  if (peerConnection) {
    peerConnection.close();
    peerConnections.delete(peerId);
  }
}

async function handleOffer(to) {
  if (!localStream) {
    alert("Please start video first!");
    return;
  }

  if (!userId) {
    alert("please login first");
    return;
  }

  const peerConnection = initPeerConnection(to);

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await sendEvent("offer", new OfferEvent("offer", userId, to, offer.sdp));
  } catch (err) {
    console.error("Error creating offer:", error);
  }
}

async function handleAnswer(peerId, to, offer) {
  if (!localStream) {
    alert("Please start video first!");
    return;
  }

  const peerConnection = initPeerConnection(to);
  try {
    await peerConnection.setRemoteDescription({
      type: "offer",
      sdp: offer,
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await sendEvent(
      "answer",
      new AnswerEvent("answer", peerId, to, answer.sdp)
    );
  } catch (err) {
    console.error("Error creating answer:", err);
  }
}

async function setAnswer(peerId, answer) {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    alert("No connection found for this peer!");
    return;
  }

  try {
    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answer,
    });
  } catch (error) {
    console.error("Error setting answer:", error);
  }
}

// event

class Event {
  constructor(type, payload) {
    this.type = type;
    this.payload = payload;
  }
}

class JoinRoomEvent {
  constructor(type, room, userId) {
    this.type = type;
    this.room = room;
    this.userId = userId;
  }
}

class RoomInfoEvent {
  constructor(type, room, users) {
    this.type = type;
    this.room = room;
    this.users = users;
  }
}

class NewPeerEvent {
  constructor(type, room, userId) {
    this.type = type;
    this.room = room;
    this.userId = userId;
  }
}

class OfferEvent {
  constructor(type, from, to, sdp) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.sdp = sdp;
  }
}

class AnswerEvent {
  constructor(type, from, to, sdp) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.sdp = sdp;
  }
}

class Candidate {
  constructor(candidate, sdpMid, sdpMLineIndex) {
    this.candidate = candidate;
    this.sdpMid = sdpMid; // Fixed from spdmid
    this.sdpMLineIndex = sdpMLineIndex;
  }
}

class CandidateEvent {
  constructor(type, from, to, candidate) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.candidate = candidate;
  }
}

function sendEvent(eventName, payload) {
  const event = new Event(eventName, payload);

  conn.send(JSON.stringify(event));
}

// Modified routeEvent function
function routeEvent(event) {
  if (event.type === undefined) {
    alert("no type field in the event");
    return;
  }

  switch (event.type) {
    case "join_room":
      console.log("Join to room:", event);
      break;
    case "room_info":
      console.log("Room Info:", event.payload);
      break;
    case "new_peer":
      console.log("New Peer:", event.payload);
      handleOffer(event.payload.user_id);
      break;
    case "offer":
      console.log("Offer:", event.payload);
      handleAnswer(event.payload.to, event.payload.from, event.payload.sdp);
      console.log(peerConnections);
      break;
    case "answer":
      console.log("Answer:", event.payload);
      setAnswer(event.payload.from, event.payload.sdp);
      console.log(peerConnections);
      break;
    case "ice_candidate":
      console.log("ICE Candidate:", event.payload);
      const payload = event.payload;
      handleIce(payload);
      break;
    default:
      console.warn("unsupported message type:", event.type);
      break;
  }
}

async function handleIce(payload) {
  const peerConn = peerConnections.get(payload.from);

  if (!peerConn) {
    console.warn("No peer connection found for:", payload.from);
    return;
  }

  try {
    // The candidate object is directly in payload.candidate
    if (payload.candidate) {
      const candidateObj = {
        candidate: payload.candidate.candidate,
        sdpMid: payload.candidate.sdp_mid,
        sdpMLineIndex: payload.candidate.sdp_m_line_index,
      };

      console.log("Creating ICE candidate with:", candidateObj);
      const candidate = new RTCIceCandidate(candidateObj);
      await peerConn.addIceCandidate(candidate);
    }
  } catch (err) {
    console.error("Error adding ICE candidate:", err, payload.candidate);
  }
}

function connectWebsocket(otp) {
  if (!window["WebSocket"]) {
    alert("Not supporting websockets");
    return;
  }

  try {
    conn = new WebSocket("wss://" + document.location.host + "/ws?otp=" + otp);

    conn.onopen = function (evt) {
      isConnected = true;
      // Join room and process any queued messages
      let changeEvent = new JoinRoomEvent("join_room", roomId, otp);
      sendEvent("join_room", changeEvent);
    };

    conn.onclose = function (evt) {
      isConnected = false;
      alert("Disconnected from WebSocket");
    };

    conn.onerror = function (evt) {
      console.error("WebSocket error:", evt);
      isConnected = false;
    };

    conn.onmessage = function (evt) {
      try {
        const eventData = JSON.parse(evt.data);
        const event = Object.assign(new Event(), eventData);
        routeEvent(event);
      } catch (error) {
        console.error("Error processing message:", error);
      }
    };
  } catch (error) {
    console.error("Error creating WebSocket connection:", error);
    attemptReconnect();
  }
}

function login() {
  fetch("login", {
    method: "post",
    body: JSON.stringify({
      username: "ardhi",
      password: "123",
    }),
    mode: "cors",
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        throw "unauthorized";
      }
    })
    .then((data) => {
      // we are authenticated
      connectWebsocket(data.otp);
      userId = data.otp;
      console.log(userId);
    })
    .catch((e) => {
      alert(e);
    });
  return false;
}

window.addEventListener("load", async () => {
  try {
    await startVideo();
    await login();
  } catch (err) {
    console.error("Something wrong:", error);
  }
});
