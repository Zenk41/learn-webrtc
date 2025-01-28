let client;
let channel;

let localStream;
let remoteStream;
let peerConnection;

let username = "dudung";
let password = "123";

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

let init = async () => {
  // client = await AgoraRTM.createInstance(APP_ID);
  // await client.login({ uid, token });

  // // index.html?room=23123
  // channel = client.createChannel("main");
  // await channel.join();

  // channel.on("MemberJoined", handleUserJoined);

  loginWithoutForm()

  changeChatRoomWithoutdata()




  localStream = await navigator.mediaDevices.getUserMedia({
    // permission
    video: true, // access to videos
    audio: false, // acces to audio
  });
  document.getElementById("user-1").srcObject = localStream;
  createOffer();
};

let handleUserJoined = async (MemberId) => {
  console.log("A new user joined the channel: ", MemberId);
};

let createOffer = async () => {
  // peerConnection = new RTCPeerConnection(servers);
  // remoteStream = new MediaStream();
  // document.getElementById("user-2").srcObject = remoteStream;
  // localStream.getTracks().forEach((track) => {
  //   peerConnection.addTrack(track, localStream);
  // });
  // peerConnection.ontrack = (event) => {
  //   event.streams[0].getTracks().forEach((track) => {
  //     remoteStream.addTrack(track);
  //   });
  // };
  // peerConnection.onicecandidate = async (event) => {
  //   if (event.candidate) {
  //     console.log("New ICE candidate:", event.candidate);
  //   }
  // };
  // let offer = await peerConnection.createOffer();
  // await peerConnection.setLocalDescription(offer);
  // client;
};

init();

// websocket chat
// selectedchat is by default General.
var selectedChat = "general";

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

function routeEvent(event) {
  if (event.type === undefined) {
    alert("no type field in the event");
  }

  switch (event.type) {
    case "new_message":
      const messageEvent = Object.assign(new NewMessageEvent(), event.payload);
      appendChatMessage(messageEvent);
      break;
    case "user_join":
      const joinEvent = Object.assign(new UserJoinEvent(), event.payload);
      appendJoinMessage(joinEvent);
      break;
    default:
      alert("unsupported message type");
      break;
  }
}

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

function sendEvent(eventName, payload) {
  const event = new Event(eventName, payload);

  conn.send(JSON.stringify(event));
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

/**
 * changeChatRoom will update the value of selectedchat
 * and also notify the server that it changes chatroom
 * */
function changeChatRoomWithoutdata() {
  // Change Header to reflect the Changed chatroom
  if (newchat != null && newchat.value != selectedChat) {
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
/**
 * sendMessage will send a new message onto the Websocket
 * */
function sendMessage() {
  var newmessage = document.getElementById("message");
  if (newmessage != null) {
    // console.log(newmessage);
    // conn.send(newmessage.value);
    let outgoundEvent = new SendMessageEvent(newmessage.value, "ardhi");
    sendEvent("send_message", outgoundEvent);
  }
  return false;
}

function loginWithoutForm() {
  let formData = {
    username: username,
    password: password,
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

function connectWebsocket(otp) {
  if (window["WebSocket"]) {
    console.log("supports websockets");
    // connect to websocket
    conn = new WebSocket("wss://" + document.location.host + "/ws?otp=" + otp);

    conn.onopen = function (evt) {
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = true";
    };

    conn.onclose = function (evt) {
      document.getElementById("connection-header").innerHTML =
        "Connected to Websocket = false";
      // reconnection
    };

    conn.onmessage = function (evt) {
      // console.log(evt)
      const eventData = JSON.parse(evt.data);

      const event = Object.assign(new Event(), eventData);

      routeEvent(event);
    };
  } else {
    alert("Not supporting websockets");
  }
}

/**
 * Once the website loads, we want to apply listeners and connect to websocket
 * */
window.onload = function () {
  // Apply our listener functions to the submit event on both forms
  // we do it this way to avoid redirects
  document.getElementById("chatroom-selection").onsubmit = changeChatRoom;
  document.getElementById("chatroom-message").onsubmit = sendMessage;
  document.getElementById("login-form").onsubmit = login;

  // Check if the browser supports WebSocket
};
