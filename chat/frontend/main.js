let localStream;
const peerConnections = new Map();

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");

if (!roomId) {
  window.location = "lobby.html";
}

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
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById("localVideo").srcObject = localStream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
}

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

// Toggle Camera Function
let toggleCamera = async () => {
  let videoTrack = localStream
    .getTracks()
    .find((track) => track.kind === "video");

  const cameraBtn = document.getElementById("camera-btn");

  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    // Add Tailwind classes to indicate the camera is off
    cameraBtn.classList.add("bg-gray-600"); // Change background color
    cameraBtn.classList.remove("bg-gray-800"); // Remove default background color
    cameraBtn.innerHTML = '<i class="fas fa-video-slash text-2xl"></i>'; // Change icon to "video off"
  } else {
    videoTrack.enabled = true;
    videoTrack.stop();
    // Revert to default Tailwind classes
    cameraBtn.classList.remove("bg-gray-600");
    cameraBtn.classList.add("bg-gray-800");
    cameraBtn.innerHTML = '<i class="fas fa-video text-2xl"></i>'; // Change icon back to "video on"
  }
};

// Toggle Microphone Function
let toggleMic = async () => {
  let audioTrack = localStream
    .getTracks()
    .find((track) => track.kind === "audio");

  const micBtn = document.getElementById("mic-btn");

  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    // Add Tailwind classes to indicate the mic is off
    micBtn.classList.add("bg-gray-600"); // Change background color
    micBtn.classList.remove("bg-gray-800"); // Remove default background color
    micBtn.innerHTML = '<i class="fas fa-microphone-slash text-2xl"></i>'; // Change icon to "mic off"
  } else {
    audioTrack.enabled = true;
    // Revert to default Tailwind classes
    micBtn.classList.remove("bg-gray-600");
    micBtn.classList.add("bg-gray-800");
    micBtn.innerHTML = '<i class="fas fa-microphone text-2xl"></i>'; // Change icon back to "mic on"
  }
};

let init = async () => {
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  document.getElementById("user-1").srcObject = localStream;
};

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
  constructor(candidate, sdpmid, sdpmlineindex) {
    this.candidate = candidate;
    this.spdmid = sdpmid;
    this.sdpmlineindex = sdpmlineindex;
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

async function createOffer(peerId) {
  if (!localStream) {
    alert("Please start video first!");
    return;
  }

  const pc = initPeerConnection(peerId);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  } catch (error) {
    console.error("Error creating offer:", error);
  }
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
      createOffer(event.payload.user_id);
      break;
    case "offer":
      console.log("Offer:", event.payload);
      handleOffer(event);
      break;
    case "answer":
      console.log("Answer:", event.payload);
      handleAnswer(event);
      break;
    case "ice_candidate":
      console.log("ICE Candidate:", event.payload);
      handleIceCandidate(event);
      break;
    default:
      console.warn("unsupported message type:", event.type);
      break;
  }
}

function handleNewPeer(event) {
  console.log("Handling Offer:", event);

  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(servers);
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate...");
      sendEvent(
        "ice_candidate",
        new CandidateEvent("ice_candidate", event.candidate)
      );
    }
  };
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
    })
    .catch((e) => {
      alert(e);
    });
  return false;
}

// Update the initialization:
window.addEventListener("load", async () => {
  try {
    await init();
    await login(); // Now returns a promise

    document
      .getElementById("camera-btn")
      .addEventListener("click", toggleCamera);
    document.getElementById("mic-btn").addEventListener("click", toggleMic);
  } catch (error) {
    console.error("Initialization error:", error);
    alert(
      "Failed to initialize video chat. Please check your camera and microphone permissions."
    );
  }
});
