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
	EventSendMessage = "send_message"
	EventNewMessage  = "new_message"
	EventChangeRoom  = "change_room"
	EventUserJoin = "user_join"
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


type UserJoinEvent struct {
	Username string `json:"username"`
	Room string `json:"room"`
	JoinedAt time.Time `json:"joined_at"`
}