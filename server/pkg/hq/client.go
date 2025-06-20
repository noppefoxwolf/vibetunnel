package hq

import (
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Client handles registration with HQ server
type Client struct {
	config *config.Config
}

// NewClient creates a new HQ client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		config: cfg,
	}
}

// Register registers this server with the HQ
func (c *Client) Register() error {
	// TODO: Implement
	return nil
}

// Unregister unregisters this server from the HQ
func (c *Client) Unregister() {
	// TODO: Implement
}