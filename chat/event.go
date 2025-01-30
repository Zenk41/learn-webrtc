package main

import (
	"encoding/json"
	"time"
)

type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type EventHandler func(event Event, c *Client) error

const (
	EventSendMessage  = "send_message"
	EventNewMessage   = "new_message"
	EventChangeRoom   = "change_room"
	EventJoinRoom     = "join_room"
	EventRoomInfo     = "room_info"
	EventNewPeer      = "new_peer"
	EventOffer        = "offer"
	EventAnswer       = "answer"
	EventIceCandidate = "ice_candidate"
)

type SendMessageEvent struct {
	Message string `json:"message"`
	From    string `json:"from"`
}

type NewMessageEvent struct {
	SendMessageEvent
	Sent time.Time `json:"sent"`
}

type ChangeRoomEvent struct {
	Name string `json:"name"`
}

type JoinRoomEvent struct {
	Type   string `json:"type"`
	Room   string `json:"room"`
	UserId string `json:"user_id"`
}

type RoomInfoEvent struct {
	Type  string   `json:"type"`
	Room  string   `json:"room"`
	Users []string `json:"users"`
}

type NewPeerEvent struct {
	Type   string `json:"type"`
	Room   string `json:"room"`
	UserId string `json:"user_id"`
}

type OfferEvent struct {
	Type string `json:"type"`
	From string `json:"from"`
	To   string `json:"to"`
	Sdp  string `json:"sdp"`
}

type AnswerEvent struct {
	Type string `json:"type"`
	From string `json:"from"`
	To   string `json:"to"`
	Sdp  string `json:"sdp"`
}

type Candidate struct {
	Candidate     string `json:"candidate"`
	SdpMid        string `json:"sdp_mid"`
	SdpMLineIndex int    `json:"sdp_m_line_index"`
}

type IceCandidateEvent struct {
	Type      string    `json:"type"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Candidate Candidate `json:"candidate"`
}
