package hq

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Client handles registration with HQ server
type Client struct {
	config       *config.Config
	registered   bool
	remoteID     string
	httpClient   *http.Client
}

// NewClient creates a new HQ client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		config:     cfg,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// Register registers this server with the HQ
func (c *Client) Register() error {
	if c.registered {
		return nil
	}

	// Get server's public URL
	serverURL := fmt.Sprintf("http://localhost:%d", c.config.Port)
	if envURL := os.Getenv("VIBETUNNEL_PUBLIC_URL"); envURL != "" {
		serverURL = envURL
	}

	// Prepare registration request
	reqBody := map[string]string{
		"name":        c.config.RemoteName,
		"url":         serverURL,
		"bearerToken": c.config.BearerToken,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %v", err)
	}

	// Create request
	req, err := http.NewRequest("POST", c.config.HQUrl+"/api/remotes/register", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	if c.config.HQUsername != "" && c.config.HQPassword != "" {
		req.SetBasicAuth(c.config.HQUsername, c.config.HQPassword)
	}

	// Send request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to register with HQ: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("HQ returned status %d", resp.StatusCode)
	}

	// Parse response
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to parse response: %v", err)
	}

	c.remoteID = result.ID
	c.registered = true

	log.Printf("Successfully registered with HQ as '%s' (ID: %s)", c.config.RemoteName, c.remoteID)
	return nil
}

// Unregister unregisters this server from the HQ
func (c *Client) Unregister() {
	if !c.registered || c.remoteID == "" {
		return
	}

	// Create request
	req, err := http.NewRequest("DELETE", c.config.HQUrl+"/api/remotes/"+c.remoteID, nil)
	if err != nil {
		log.Printf("Failed to create unregister request: %v", err)
		return
	}

	// Set headers
	if c.config.HQUsername != "" && c.config.HQPassword != "" {
		req.SetBasicAuth(c.config.HQUsername, c.config.HQPassword)
	}

	// Send request (best effort)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("Failed to unregister from HQ: %v", err)
		return
	}
	resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Printf("Successfully unregistered from HQ")
	} else {
		log.Printf("HQ returned status %d during unregistration", resp.StatusCode)
	}

	c.registered = false
	c.remoteID = ""
}