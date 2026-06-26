package ws

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/raz0red/ifwithgraphics/frotz-ws/internal/frotz"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type inMsg struct {
	Cmd string `json:"cmd"`
}

type outMsg struct {
	Type        string `json:"type"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Message     string `json:"message,omitempty"`
}

type Server struct {
	dfrotz string
	story  string
}

func NewServer(dfrotz, story string) *Server {
	return &Server{dfrotz: dfrotz, story: story}
}

func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	sess, err := frotz.NewSession(s.dfrotz, s.story)
	if err != nil {
		sendError(conn, "failed to start frotz: "+err.Error())
		return
	}
	defer sess.Close()

	log.Printf("session started: %s", s.story)

	for {
		room, err := sess.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			sendError(conn, err.Error())
			break
		}

		if err := send(conn, outMsg{
			Type:        "room",
			Title:       room.Title,
			Description: room.Description,
		}); err != nil {
			break
		}

		// wait for command from client
		var in inMsg
		if err := conn.ReadJSON(&in); err != nil {
			break
		}

		if err := sess.Send(in.Cmd); err != nil {
			sendError(conn, err.Error())
			break
		}
	}

	log.Printf("session ended: %s", s.story)
}

func send(conn *websocket.Conn, msg outMsg) error {
	b, _ := json.Marshal(msg)
	return conn.WriteMessage(websocket.TextMessage, b)
}

func sendError(conn *websocket.Conn, msg string) {
	send(conn, outMsg{Type: "error", Message: msg})
}
