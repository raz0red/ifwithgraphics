package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/raz0red/ifwithgraphics/frotz-ws/internal/ws"
)

func main() {
	port  := flag.String("port",  "9191",              "WebSocket listen port")
	dfrotz := flag.String("frotz", "./frotz/bin/dfrotz", "path to dfrotz binary")
	flag.Parse()

	story := flag.Arg(0)
	if story == "" {
		log.Fatal("usage: frotz-ws [flags] <story.z3|z5>")
	}

	srv := ws.NewServer(*dfrotz, story)
	http.HandleFunc("/ws", srv.Handle)

	log.Printf("frotz-ws listening on :%s  story:%s", *port, story)
	log.Fatal(http.ListenAndServe(":"+*port, nil))
}
