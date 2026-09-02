package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const websocketGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const (
	GridCols = 21
	GridRows = 21
)

type HealthResponse struct {
	Status string `json:"status"`
}

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Snake struct {
	Body      []Position `json:"body"`
	Direction Position   `json:"direction"`
}

type GameState struct {
	Snake Snake `json:"snake"`
}

type ClientMessage struct {
	Type      string `json:"type"`
	Direction string `json:"direction"`
}

func newGameState() GameState {
	return GameState{
		Snake: Snake{
			Body: []Position{
				{X: 10, Y: 10},
				{X: 9, Y: 10},
				{X: 8, Y: 10},
			},
			Direction: Position{X: 1, Y: 0},
		},
	}
}

func moveSnake(game *GameState) {
	head := game.Snake.Body[0]

	nextHead := Position{
		X: (head.X + game.Snake.Direction.X + GridCols) % GridCols,
		Y: (head.Y + game.Snake.Direction.Y + GridRows) % GridRows,
	}

	for i := len(game.Snake.Body) - 1; i > 0; i-- {
		game.Snake.Body[i] = game.Snake.Body[i-1]
	}

	game.Snake.Body[0] = nextHead
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	response := HealthResponse{Status: "ok"}

	err := json.NewEncoder(w).Encode(response)

	if err != nil {
		fmt.Println("Error in health")
	}
}

func writeTextFrame(bufrw *bufio.ReadWriter, payload []byte) error {
	if len(payload) > 125 {
		return fmt.Errorf("payload too large: %d bytes", len(payload))
	}

	frame := append([]byte{0x81, byte(len(payload))}, payload...)

	if _, err := bufrw.Write(frame); err != nil {
		return err
	}

	return bufrw.Flush()
}

func writeMessages(bufrw *bufio.ReadWriter, messages <-chan []byte) {
	for payload := range messages {
		if err := writeTextFrame(bufrw, payload); err != nil {
			log.Printf("write message: %v", err)
			return
		}
	}
}

func websocketHandler(w http.ResponseWriter, r *http.Request) {

	log.Printf("WebSocket connection requested.\n")

	if r.Method != http.MethodGet {
		http.Error(w, "method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	upgrade := r.Header.Get("Upgrade")
	connection := r.Header.Get("Connection")
	secWebsocketVersion := r.Header.Get("Sec-Websocket-Version")
	secWebsocketKey := r.Header.Get("Sec-WebSocket-Key")

	if !strings.EqualFold(upgrade, "websocket") {
		http.Error(w, "upgrade header must be websocket", http.StatusBadRequest)
		return
	}

	if !strings.Contains(strings.ToLower(connection), "upgrade") {
		http.Error(w, "connection header must include upgrade", http.StatusBadRequest)
		return
	}

	if secWebsocketVersion != "13" {
		w.Header().Set("Sec-Websocket-Version", "13")
		http.Error(w, "unsupported websocket version", http.StatusUpgradeRequired)
		return
	}

	if secWebsocketKey == "" {
		http.Error(w, "missing Sec-WebSocket-Key", http.StatusBadRequest)
		return
	}

	sum := sha1.Sum([]byte(secWebsocketKey + websocketGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])

	hj, ok := w.(http.Hijacker)

	if !ok {
		http.Error(w, "hijacking not supported", http.StatusInternalServerError)
		return
	}

	conn, bufrw, err := hj.Hijack()

	if err != nil {
		log.Printf("hijack: %v", err)
		return
	}

	defer conn.Close()

	message := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: %s\r\n" +
		"\r\n"

	fmt.Fprintf(bufrw, message, accept)

	if err := bufrw.Flush(); err != nil {
		log.Printf("flush: %v", err)
		return
	}

	log.Printf("Connection upgraded to WebSocket.\n")

	done := make(chan struct{})
	defer close(done)

	messages := make(chan []byte, 16)

	go writeMessages(bufrw, messages)
	go runGameLoop(messages, done)

	for {
		header := make([]byte, 2)

		if _, err := io.ReadFull(bufrw, header); err != nil {
			log.Printf("read header: %v", err)
			return
		}

		fin := header[0]&0x80 != 0
		opcode := header[0] & 0x0F
		masked := header[1]&0x80 != 0
		payloadLen := int(header[1] & 0x7F)

		log.Printf("frame: fin=%v opcode=%#x masked=%v len=%d", fin, opcode, masked, payloadLen)

		if masked == false {
			log.Printf("client frame is not masked")
			return
		}

		maskKey := make([]byte, 4)

		if _, err := io.ReadFull(bufrw, maskKey); err != nil {
			log.Printf("read mask key: %v", err)
			return
		}

		payload := make([]byte, payloadLen)

		if _, err := io.ReadFull(bufrw, payload); err != nil {
			log.Printf("read payload: %v", err)
			return
		}

		for i := range payloadLen {
			payload[i] ^= maskKey[i%4]
		}

		var message ClientMessage

		if err := json.Unmarshal(payload, &message); err != nil {
			log.Printf("invalid client message: %v", err)
			continue
		}

		log.Printf("client message: type=%s direction=%s", message.Type, message.Direction)
	}
}

func runGameLoop(messages chan<- []byte, done <-chan struct{}) {
	game := newGameState()

	ticker := time.NewTicker(125 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		moveSnake(&game)

		snapshot, err := json.Marshal(game)

		if err != nil {
			log.Printf("Error marshalling game state: %v", err)
			continue
		}

		select {
		case messages <- snapshot:
		case <-done:
			close(messages)
			return
		}
	}
}

func main() {

	server := http.NewServeMux()
	server.Handle("/", http.FileServer(http.Dir("static")))
	server.HandleFunc("/ws", websocketHandler)
	server.HandleFunc("/health", healthHandler)

	fmt.Printf("Server running on the port: %d\n", 8080)

	err := http.ListenAndServe(":8080", server)

	if err != nil {
		log.Fatal("An error ocurring when try start the server:", err)
	}
}
