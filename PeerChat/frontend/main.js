let client;
let channel;
let localStream;
let remoteStream;
let peerConnection;
let username = `user_${Math.random().toString(36).substring(2)}_${Date.now()}`;
let password = "123";
let selectedChat;

// Track room state
let isInitiator = false;
let connectedUsers = new Set();

// Track state
let micMuted = false;
let cameraPaused = false;

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

// Modified init function
let init = async () => {
  try {
    // Initialize WebRTC
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById("user-2").srcObject = remoteStream;

    // Get local stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("user-1").srcObject = localStream;

    // Add tracks to peer connection
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Attach handlers
    attachPeerConnectionHandlers();

    // Add controls event listeners
    addVideoControls();

    // Do login
    await loginWithoutForm();
  } catch (error) {
    console.error("Error in init:", error);
  }
};

// Add video controls
function addVideoControls() {
  // Camera toggle
  const cameraBtn = document.getElementById("camera-btn");
  cameraBtn.addEventListener("click", toggleCamera);

  // Microphone toggle
  const micBtn = document.getElementById("mic-btn");
  micBtn.addEventListener("click", toggleMic);
}

// Toggle camera
function toggleCamera() {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    cameraPaused = !cameraPaused;
    videoTrack.enabled = !cameraPaused;

    const cameraBtn = document.getElementById("camera-btn");
    cameraBtn.style.backgroundColor = cameraPaused
      ? "rgb(255, 80, 80)"
      : "rgb(179, 102, 249, .9)";
  }
}

// Toggle microphone
function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    micMuted = !micMuted;
    audioTrack.enabled = !micMuted;

    const micBtn = document.getElementById("mic-btn");
    micBtn.style.backgroundColor = micMuted
      ? "rgb(255, 80, 80)"
      : "rgb(179, 102, 249, .9)";
  }
}

// Keep existing event classes...
class Event {
  constructor(type, payload) {
    this.type = type;
    this.payload = payload;
  }
}

class SendMessageEvent {
  constructor(message, from) {
    this.message = message;
    this.from = from;
  }
}

class UserJoinEvent {
  constructor(username, room, joinedAt) {
    this.username = username;
    this.room = room;
    this.joinedAt = joinedAt;
  }
}

class NewMessageEvent {
  constructor(message, from, sent) {
    this.message = message;
    this.from = from;
    this.sent = sent;
  }
}

class ChangeChatRoomEvent {
  constructor(name) {
    this.name = name;
  }
}

// Add connection state management
let messageQueue = [];
const MAX_QUEUE_SIZE = 50;
let isConnected = false;

// Enhanced sendEvent function with queuing
function sendEvent(eventName, payload) {
  if (conn && conn.readyState === WebSocket.OPEN) {
    const event = new Event(eventName, payload);
    try {
      conn.send(JSON.stringify(event));
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      queueMessage(eventName, payload);
      return false;
    }
  } else {
    console.warn("WebSocket not ready, queuing event:", eventName);
    queueMessage(eventName, payload);

    // Attempt to reconnect if connection is closed
    if (!conn || conn.readyState === WebSocket.CLOSED) {
      attemptReconnect();
    }
    return false;
  }
}

// Queue messages when connection is lost
function queueMessage(eventName, payload) {
  if (messageQueue.length < MAX_QUEUE_SIZE) {
    messageQueue.push({ eventName, payload, timestamp: Date.now() });
  } else {
    console.warn("Message queue full, dropping oldest message");
    messageQueue.shift(); // Remove oldest message
    messageQueue.push({ eventName, payload, timestamp: Date.now() });
  }
}

// Process queued messages when connection is restored
function processMessageQueue() {
  while (
    messageQueue.length > 0 &&
    conn &&
    conn.readyState === WebSocket.OPEN
  ) {
    const message = messageQueue.shift();
    sendEvent(message.eventName, message.payload);
  }
}

// Modified connectWebsocket function with better state management
function connectWebsocket(otp) {
  if (!window["WebSocket"]) {
    alert("Not supporting websockets");
    return;
  }

  try {
    conn = new WebSocket("wss://" + document.location.host + "/ws?otp=" + otp);

    conn.onopen = function (evt) {
      isConnected = true;
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = true";
      console.log("WebSocket connection established");

      // Join room and process any queued messages
      sendEvent("join_room", {
        room: roomId,
        username: username,
      });

      changeChatRoomWithoutdata();
      processMessageQueue();
    };

    conn.onclose = function (evt) {
      isConnected = false;
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = false";
      console.log("WebSocket connection closed");
      attemptReconnect();
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

// Add reconnection logic
let reconnectTimeout = null;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

function attemptReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("Max reconnection attempts reached");
    alert("Connection lost. Please refresh the page to reconnect.");
    return;
  }

  reconnectTimeout = setTimeout(() => {
    console.log(
      `Attempting to reconnect... (${
        reconnectAttempts + 1
      }/${MAX_RECONNECT_ATTEMPTS})`
    );
    reconnectAttempts++;

    loginWithoutForm()
      .then(() => {
        console.log("Reconnection successful");
        reconnectAttempts = 0;
      })
      .catch((error) => {
        console.error("Reconnection failed:", error);
        attemptReconnect();
      });
  }, RECONNECT_DELAY);
}

function changeChatRoomWithoutdata() {
  if (conn && conn.readyState === WebSocket.OPEN) {
    selectedChat = roomId;
    header = document.getElementById("chat-header").innerHTML =
      "Currently in chatroom: " + selectedChat;

    let changeEvent = new ChangeChatRoomEvent(selectedChat);
    sendEvent("change_room", changeEvent);

    textarea = document.getElementById("chatmessages");
    textarea.innerHTML = `You changed room into: ${selectedChat}`;
  }
  return false;
}

function connectWebsocket(otp) {
  if (window["WebSocket"]) {
    conn = new WebSocket("wss://" + document.location.host + "/ws?otp=" + otp);

    conn.onopen = function (evt) {
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = true";

      // Now that connection is open, join room and change chat room
      sendEvent("join_room", {
        room: roomId,
        username: username,
      });

      // Change chat room after joining
      changeChatRoomWithoutdata();
    };

    conn.onclose = function (evt) {
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = false";
    };

    conn.onmessage = function (evt) {
      const eventData = JSON.parse(evt.data);
      const event = Object.assign(new Event(), eventData);
      routeEvent(event);
    };
  } else {
    alert("Not supporting websockets");
  }
}

function loginWithoutForm() {
  return new Promise((resolve, reject) => {
    let formData = {
      username: username,
      password: password,
    };

    fetch("login", {
      method: "post",
      body: JSON.stringify(formData),
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("unauthorized");
      })
      .then((data) => {
        connectWebsocket(data.otp);
        resolve(data);
      })
      .catch((e) => {
        console.error("Login error:", e);
        reject(e);
      });
  });
}

// Modified routeEvent function
function routeEvent(event) {
  if (event.type === undefined) {
    alert("no type field in the event");
    return;
  }

  switch (event.type) {
    case "new_message":
      const messageEvent = Object.assign(new NewMessageEvent(), event.payload);
      appendChatMessage(messageEvent);
      break;
    case "user_join":
      const joinEvent = Object.assign(new UserJoinEvent(), event.payload);
      handleUserJoin(joinEvent);
      break;
    case "user_ready":
      handleUserReady(event.payload);
      break;
    case "offer":
      handleOffer(event.payload.offer, event.payload.from);
      break;
    case "answer":
      handleAnswer(event.payload.answer);
      break;
    case "ice_candidate":
      handleIceCandidate(event.payload.candidate);
      break;
    default:
      console.warn("unsupported message type:", event.type);
      break;
  }
}

// New function to handle user ready signals
function handleUserReady(payload) {
  if (payload.username !== username) {
    // Only the first user in the room should initiate connections
    const shouldInitiate = Array.from(connectedUsers).sort()[0] === username;

    if (shouldInitiate) {
      console.log("Initiating connection with:", payload.username);
      createOffer();
    }
  }
}

// New function to handle user joins
function handleUserJoin(joinEvent) {
  appendJoinMessage(joinEvent);

  // Don't create offer for our own join event
  if (joinEvent.username === username) {
    // We just joined, send ready signal
    sendEvent("user_ready", {
      username: username,
      room: roomId,
    });
    return;
  }

  // Add to connected users
  connectedUsers.add(joinEvent.username);
}
// Keep existing message handling functions...
function appendChatMessage(messageEvent) {
  var date = new Date(messageEvent.sent);
  const formattedMsg = `${date.toLocaleString()}: ${messageEvent.message}`;

  textarea = document.getElementById("chatmessages");
  textarea.innerHTML = textarea.innerHTML + "\n" + formattedMsg;
  textarea.scrollTop = textarea.scrollHeight;
}

function appendJoinMessage(joinEvent) {
  var date = new Date(joinEvent.joinedAt);
  const formattedMsg = `${date.toLocaleString()}: New user joined ${
    joinEvent.room
  }`;

  textarea = document.getElementById("chatmessages");
  textarea.innerHTML = textarea.innerHTML + "\n" + formattedMsg;
  textarea.scrollTop = textarea.scrollHeight;
}

async function createOffer(targetUser) {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendEvent("offer", {
      offer: offer,
      room: roomId,
      from: username,
      to: targetUser, // Specify who should receive this offer
    });
  } catch (error) {
    console.error("Error creating offer:", error);
  }
}

// Add connection reset function
async function resetConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  // Recreate peer connection
  peerConnection = new RTCPeerConnection(servers);

  // Reattach all event handlers
  attachPeerConnectionHandlers();

  // Readd local tracks
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });
}

// Separate function for attaching peer connection handlers
function attachPeerConnectionHandlers() {
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    document.getElementById("user-2").style.display = "block";
    document.getElementById("user-1").classList.add("smallFrame");
  };

  peerConnection.onconnectionstatechange = (event) => {
    console.log("Connection state:", peerConnection.connectionState);
    if (peerConnection.connectionState === "connected") {
      console.log("Peer connected!");
      document.getElementById("user-2").style.display = "block";
      document.getElementById("user-1").classList.add("smallFrame");
    }
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate && conn && conn.readyState === WebSocket.OPEN) {
      sendEvent("ice_candidate", {
        candidate: event.candidate,
        room: roomId,
      });
    }
  };
}

async function handleOffer(offer) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    sendEvent("answer", {
      answer: answer,
      room: roomId,
    });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
}

async function handleAnswer(answer) {
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  } catch (error) {
    console.error("Error handling answer:", error);
  }
}

async function handleIceCandidate(candidate) {
  try {
    if (candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error("Error handling ICE candidate:", error);
  }
}

// Update the sendMessage function to handle failed sends
function sendMessage() {
  var newmessage = document.getElementById("message");
  if (newmessage != null) {
    let outgoingEvent = new SendMessageEvent(newmessage.value, username);
    if (sendEvent("send_message", outgoingEvent)) {
      newmessage.value = ""; // Only clear if send was successful
    } else {
      // Optionally show a pending message indicator
      console.log("Message queued for delivery");
    }
  }
  return false;
}

// Add connection status check function
function isWebSocketConnected() {
  return conn && conn.readyState === WebSocket.OPEN;
}

// Add periodic connection check
setInterval(() => {
  if (!isWebSocketConnected() && !reconnectTimeout) {
    console.log("Connection check failed, attempting to reconnect...");
    attemptReconnect();
  }
}, 5000);

window.onload = function () {
  document.getElementById("chatroom-selection").onsubmit = changeChatRoom;
  document.getElementById("chatroom-message").onsubmit = sendMessage;
  document.getElementById("login-form").onsubmit = login;
  init();
};

// Update window.onbeforeunload
window.onbeforeunload = function () {
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  if (peerConnection) {
    peerConnection.close();
  }
  if (conn) {
    conn.close();
  }
};

function login() {
  let formData = {
    username: document.getElementById("username").value,
    password: document.getElementById("password").value,
  };

  fetch("login", {
    method: "post",
    body: JSON.stringify(formData),
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

/**
 * changeChatRoom will update the value of selectedchat
 * and also notify the server that it changes chatroom
 * */
function changeChatRoom() {
  // Change Header to reflect the Changed chatroom
  var newchat = document.getElementById("chatroom");
  if (newchat != null && newchat.value != selectedChat) {
    selectedChat = newchat.value;
    header = document.getElementById("chat-header").innerHTML =
      "Currently in chatroom: " + selectedChat;

    let changeEvent = new ChangeChatRoomEvent(selectedChat);

    sendEvent("change_room", changeEvent);

    textarea = document.getElementById("chatmessages");
    textarea.innerHTML = `You changed room into: ${selectedChat}`;
  }
  return false;
}
