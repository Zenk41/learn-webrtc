package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
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
	m.handlers[EventUserJoin] = handleUserJoin
}

func ChatRoomHandler(event Event, c *Client) error {
	var changeRoomEvent ChangeRoomEvent

	if err := json.Unmarshal(event.Payload, &changeRoomEvent); err != nil {
		return fmt.Errorf("bad payload in request: %v", err)
	}

	// Store old room to avoid sending join message to it
	oldRoom := c.chatroom

	// Update client's room
	c.chatroom = changeRoomEvent.Name

	log.Printf("User changing room from %s to %s", oldRoom, c.chatroom)

	// Create join message
	joinEvent := UserJoinEvent{
		Username: "User", // You can modify this if you track usernames
		Room:     c.chatroom,
		JoinedAt: time.Now(),
	}

	data, err := json.Marshal(joinEvent)
	if err != nil {
		log.Printf("failed to marshal join event: %v", err)
		return err
	}

	outgoingEvent := Event{
		Type:    EventUserJoin,
		Payload: data,
	}

	log.Printf("Broadcasting join message to room: %s", c.chatroom)

	// Broadcast to all clients in the new room
	clientCount := 0
	for client := range c.manager.clients {
		if client.chatroom == c.chatroom && client != c {
			clientCount++
			go func(client *Client) {
				select {
				case client.egress <- outgoingEvent:
					log.Printf("Successfully sent join message to a client in room %s", client.chatroom)
				case <-time.After(time.Second):
					log.Printf("Timeout sending join message to client in room %s", client.chatroom)
				}
			}(client)
		}
	}
	log.Printf("Attempted to send join message to %d clients in room %s", clientCount, c.chatroom)

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

func handleUserJoin(event Event, c *Client) error {
	var joinEvent UserJoinEvent
	if err := json.Unmarshal(event.Payload, &joinEvent); err != nil {
		return fmt.Errorf("bad payload in request: %v", err)
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

	client := NewClient(conn, m)

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

	if req.Password == "123" {
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
	log.Println("New client connected and registered")
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
