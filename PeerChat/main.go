package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"

	"github.com/joho/godotenv"
	"github.com/zenk41/PeerChat/db"
)

func init() {
	err := godotenv.Load()
	if err != nil {
		slog.Warn(
			"Failed to load .env file",
			slog.String(
				"message",
				"Falling back to using environment variables set via export or command line",
			),
		)
	}
}

func main() {

	rootCtx := context.Background()
	ctx, cancel := context.WithCancel(rootCtx)

	dbPool, err := db.InitDB()
	if err != nil {
		panic(err)
	}
	defer dbPool.Close()

	defer cancel()
	setupAPI(ctx)
	log.Fatal(http.ListenAndServeTLS(":9090", "server.crt", "server.key", nil))
}

func setupAPI(ctx context.Context) {

	manager := newManager(ctx)
	http.Handle("/", http.FileServer(http.Dir("./frontend")))
	http.HandleFunc("/ws", manager.serveWS)
	http.HandleFunc("/login", manager.loginHandler)
}
