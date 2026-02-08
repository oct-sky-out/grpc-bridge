package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Message represents a WebSocket message
type Message struct {
	Event   string `json:"event"`
	Payload any    `json:"payload"`
}

// Client represents a WebSocket client
type Client struct {
	SessionID string
	Conn      *websocket.Conn
	Send      chan Message
}

// Hub manages WebSocket connections
type Hub struct {
	clients    map[string]*Client // sessionID -> client
	register   chan *Client
	unregister chan *Client
	broadcast  chan Message
	mu         sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan Message, 256),
	}

	go h.run()

	return h
}

// Run starts the hub
func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.SessionID] = client
			h.mu.Unlock()
			log.Printf("[Hub] Client registered: %s", client.SessionID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.SessionID]; ok {
				delete(h.clients, client.SessionID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[Hub] Client unregistered: %s", client.SessionID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client.SessionID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Register registers a new client
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister unregisters a client
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// EmitToSession sends a message to a specific session
func (h *Hub) EmitToSession(sessionID, event string, payload any) {
	h.mu.RLock()
	client, exists := h.clients[sessionID]
	h.mu.RUnlock()

	if !exists {
		log.Printf("[Hub] Session not found: %s", sessionID)
		return
	}

	message := Message{
		Event:   event,
		Payload: payload,
	}

	select {
	case client.Send <- message:
	default:
		log.Printf("[Hub] Failed to send message to session: %s", sessionID)
	}
}

// EmitToAll broadcasts a message to all connected clients
func (h *Hub) EmitToAll(event string, payload any) {
	message := Message{
		Event:   event,
		Payload: payload,
	}

	h.broadcast <- message
}

// ReadPump handles incoming messages from the client
func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister(c)
		c.Conn.Close()
	}()

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client] Read error: %v", err)
			}
			break
		}
		// Currently, we don't process incoming messages from clients
		// All events are server-initiated
	}
}

// WritePump handles outgoing messages to the client
func (c *Client) WritePump() {
	defer func() {
		c.Conn.Close()
	}()

	for message := range c.Send {
		data, err := json.Marshal(message)
		if err != nil {
			log.Printf("[Client] Failed to marshal message: %v", err)
			continue
		}

		if err := c.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Client] Write error: %v", err)
			return
		}
	}
}
