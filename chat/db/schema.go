package db

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// PgxPool defines an interface for interacting with a PostgreSQL connection pool.
// This abstraction is useful for writing tests, as it allows mocking database calls during unit testing
// without the need for an actual database connection.
//
// The methods in the PgxPool interface are designed to handle queries, executions, and closing database connections.
type PgxPool interface {
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
	Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error)
	Close()
}
