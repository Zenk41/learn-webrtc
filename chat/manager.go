package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	websocketUpgrader = websocket.Upgrader{
		CheckOrigin:     checkOrigin,
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
)

type Manager struct {
	clients ClientList
	sync.RWMutex

	otps RetentionMap

	handlers map[string]EventHandler
}

func newManager(ctx context.Context) *Manager {
	m := &Manager{clients: make(ClientList),
		handlers: make(map[string]EventHandler), otps: NewRetentionMap(ctx, 5*time.Second)}
	m.setupEventHandlers()
	return m
}

func (m *Manager) setupEventHandlers() {
	m.handlers[EventSendMessage] = SendMessage
	m.handlers[EventChangeRoom] = ChatRoomHandler
	m.handlers[EventJoinRoom] = JoinRoomHandler
	// m.handlers[EventRoomInfo] = RoomInfoHandler
	// m.handlers[EventNewPeer] = NewPeerHandler
	m.handlers[EventOffer] = OfferHandler
	m.handlers[EventAnswer] = AnswerHandler
	m.handlers[EventIceCandidate] = IceCandidateHandler
}

func IceCandidateHandler(event Event, c *Client) error {
	var iceCandidateEvent IceCandidateEvent

	if err := json.Unmarshal(event.Payload, &iceCandidateEvent); err != nil {
		return fmt.Errorf("")
	}

	iceCandidateEvent.From = c.Username

	data, err := json.Marshal(iceCandidateEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast message: %v", err)
	}

	outgoingEvent := Event{
		Payload: data,
		Type:    EventIceCandidate,
	}

	for client := range c.manager.clients {
		if client.chatroom == c.chatroom && client.Username == iceCandidateEvent.To {
			client.egress <- outgoingEvent
		}
	}

	return nil
}

func AnswerHandler(event Event, c *Client) error {
	var answerEvent AnswerEvent

	if err := json.Unmarshal(event.Payload, &answerEvent); err != nil {
		return fmt.Errorf("")
	}

	answerEvent.From = c.Username

	data, err := json.Marshal(answerEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast message: %v", err)
	}

	outgoingEvent := Event{
		Payload: data,
		Type:    EventAnswer,
	}

	for client := range c.manager.clients {
		if client.chatroom == c.chatroom && client.Username == answerEvent.To {
			client.egress <- outgoingEvent
		}
	}

	return nil
}

func OfferHandler(event Event, c *Client) error {
	var offerEvent OfferEvent

	if err := json.Unmarshal(event.Payload, &offerEvent); err != nil {
		return fmt.Errorf("")
	}

	offerEvent.From = c.Username

	data, err := json.Marshal(offerEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast message: %v", err)
	}

	outgoingEvent := Event{
		Payload: data,
		Type:    EventOffer,
	}

	for client := range c.manager.clients {
		if client.chatroom == c.chatroom && client.Username == offerEvent.To {
			client.egress <- outgoingEvent
		}
	}

	return nil
}

// func NewPeerHandler(event Event, c *Client) error {
// 	var newPeerEvent NewPeerEvent
// 	if err := json.Unmarshal(event.Payload, &newPeerEvent); err != nil {
// 		return fmt.Errorf("bad payload in request: %v", err)
// 	}

// 	data, err := json.Marshal(newPeerEvent)
// 	if err != nil {
// 		return fmt.Errorf("failed to marshal broadcast message: %v", err)
// 	}

// 	outgoingEvent := Event{
// 		Payload: data,
// 		Type:    EventNewMessage,
// 	}

// 	for client := range c.manager.clients {
// 		if client.chatroom == c.chatroom && client.Username == c.Username {
// 			client.egress <- outgoingEvent
// 		}
// 	}

// 	return nil
// }

// func RoomInfoHandler(event Event, c *Client) error {
// 	var roomInfoEvent RoomInfoEvent
// 	if err := json.Unmarshal(event.Payload, &roomInfoEvent); err != nil {
// 		return fmt.Errorf("bad payload in request: %v", err)
// 	}

// 	return nil
// }

func JoinRoomHandler(event Event, c *Client) error {
	var joinRoomEvent JoinRoomEvent
	if err := json.Unmarshal(event.Payload, &joinRoomEvent); err != nil {
		return fmt.Errorf("failed to unmarshal join room event: %v", err)
	}

	// Update client's room
	c.chatroom = joinRoomEvent.Room

	// Collect users in the room
	var users []string
	for client := range c.manager.clients {
		if client.chatroom == c.chatroom {
			users = append(users, client.Username)
		}
	}

	// First event: Room Info
	roomInfoEvent := RoomInfoEvent{
		Type:  "room_info",
		Room:  c.chatroom,
		Users: users,
	}

	roomInfoData, err := json.Marshal(roomInfoEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal room info event: %v", err)
	}

	outgoingRoomInfo := Event{
		Type:    EventRoomInfo,
		Payload: roomInfoData,
	}

	// Second event: New Peer
	newPeerEvent := NewPeerEvent{
		Type:   "new_peer",
		Room:   c.chatroom,
		UserId: c.Username,
	}

	newPeerData, err := json.Marshal(newPeerEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal new peer event: %v", err)
	}

	outgoingNewPeer := Event{
		Type:    "new_peer",
		Payload: newPeerData,
	}
	timeout := time.After(5 * time.Second)
	// Send both events to all clients in the room
	for client := range c.manager.clients {
		if client.chatroom == c.chatroom {
			// Send events sequentially
			select {
			case client.egress <- outgoingRoomInfo:
				// First event sent successfully
			case <-timeout:
				return fmt.Errorf("timeout sending room info event to client %s", client.ID)
			}
			if client.Username != newPeerEvent.UserId {
				timeout = time.After(5 * time.Second)
				select {
				case client.egress <- outgoingNewPeer:
					// Second event sent successfully
				default:
					return fmt.Errorf("failed to send new peer event to client %s", client.ID)
				}

			}

		}
	}

	return nil
}

func ChatRoomHandler(event Event, c *Client) error {
	var changeRoomEvent ChangeRoomEvent

	if err := json.Unmarshal(event.Payload, &changeRoomEvent); err != nil {
		return fmt.Errorf("bad payload in request: %v", err)
	}

	c.chatroom = changeRoomEvent.Name

	var broadMessage NewMessageEvent
	broadMessage.Sent = time.Now()
	broadMessage.Message = "New User Join"
	broadMessage.From = c.Username

	data, err := json.Marshal(broadMessage)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast message: %v", err)
	}

	outgoingEvent := Event{
		Payload: data,
		Type:    EventNewMessage,
	}

	for client := range c.manager.clients {
		if client.chatroom == c.chatroom {
			client.egress <- outgoingEvent
		}
	}

	return nil
}

func SendMessage(event Event, c *Client) error {

	var chatevent SendMessageEvent
	if err := json.Unmarshal(event.Payload, &chatevent); err != nil {
		return fmt.Errorf("bad payload in request: %v", err)
	}

	var broadMessage NewMessageEvent

	broadMessage.Sent = time.Now()
	broadMessage.Message = chatevent.Message
	broadMessage.From = chatevent.From

	data, err := json.Marshal(broadMessage)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast message: %v", err)
	}

	outgoingEvent := Event{
		Payload: data,
		Type:    EventNewMessage,
	}

	for client := range c.manager.clients {
		if client.chatroom == c.chatroom {
			client.egress <- outgoingEvent
		}
	}

	return nil
}

func (m *Manager) routeEvent(event Event, c *Client) error {
	// check if the event type is part of the handlers
	if handler, ok := m.handlers[event.Type]; ok {
		if err := handler(event, c); err != nil {
			return err
		}
		return nil
	} else {
		return errors.New("ther is no such event type")
	}
}

func (m *Manager) serveWS(w http.ResponseWriter, r *http.Request) {
	otp := r.URL.Query().Get("otp")
	if otp == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	if !m.otps.VerifyOTP(otp) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	log.Println("new connection")

	// upgrade regular http connection into websocket
	conn, err := websocketUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	randomBytes := make([]byte, 32)

	random, _ := rand.Read(randomBytes)
	client := NewClient(conn, m, otp, strconv.Itoa(random))

	m.addClient(client)

	// Start goroutine client processes
	go client.readMessages()
	go client.writeMessages()
}

func (m *Manager) loginHandler(w http.ResponseWriter, r *http.Request) {
	type userLoginRequest struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	var req userLoginRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Username == "ardhi" && req.Password == "123" {
		type response struct {
			OTP string `json:"otp"`
		}

		otp := m.otps.NewOTP()

		resp := response{
			OTP: otp.Key,
		}

		data, err := json.Marshal(resp)
		if err != nil {
			log.Println(err)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write(data)
		return
	}
	w.WriteHeader(http.StatusUnauthorized)
}

func (m *Manager) addClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	m.clients[client] = true

}

func (m *Manager) removeClient(client *Client) {
	m.Lock()
	defer m.Unlock()

	if _, ok := m.clients[client]; ok {
		client.connection.Close()
		delete(m.clients, client)
	}
}

func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	switch origin {
	case "https://localhost:9090":
		return true
	default:
		return false
	}
}
