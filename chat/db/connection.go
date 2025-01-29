package db

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zenk41/learn-webrtc/chat/config"
)

// InitPSQL initializes a PostgreSQL connection pool and ensures successful connection to the database.
// It sets up a structured logger, creates the connection pool, acquires a connection, and pings the database.
// Exits the application if any errors occur during initialization.
func InitDB() (*pgxpool.Pool, error) {
	connPool, err := pgxpool.NewWithConfig(context.Background(), config.PSQLConfig())
	if err != nil {
		return nil, fmt.Errorf("unable to initialize pgx pool from configuration: %w", err)
	}
	conn, err := connPool.Acquire(context.Background())
	if err != nil {
		return nil, fmt.Errorf("unable to acquire connection pool: %w", err)
	}

	defer conn.Release()

	err = conn.Ping(context.Background())
	if err != nil {
		return nil, fmt.Errorf("unable to ping the connection pool: %w", err)
	}

	slog.Info("successfully connected to database")
	return connPool, nil
}

// ClosePSQL Close the postgreSQL connection pool and logs the closure.
func ClosePSQL(pool *pgxpool.Pool) {
	pool.Close()
	slog.Info("database connection closed")
}
