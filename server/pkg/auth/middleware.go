package auth

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Middleware provides authentication for the VibeTunnel server
type Middleware struct {
	config *config.Config
}

// NewMiddleware creates a new authentication middleware
func NewMiddleware(cfg *config.Config) gin.HandlerFunc {
	m := &Middleware{config: cfg}
	return m.Handle
}

// Handle processes authentication for incoming requests
func (m *Middleware) Handle(c *gin.Context) {
	// Skip auth for health check endpoint
	if c.Request.URL.Path == "/api/health" {
		c.Next()
		return
	}

	// If no auth is configured, allow all requests
	if !m.config.HasAuth() {
		c.Next()
		return
	}

	authHeader := c.GetHeader("Authorization")

	// Check Bearer token (for HQ to remote communication)
	if strings.HasPrefix(authHeader, "Bearer ") {
		if m.config.IsHQMode {
			// HQ doesn't accept bearer tokens
			c.Header("WWW-Authenticate", `Basic realm="VibeTunnel"`)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Bearer token not accepted in HQ mode",
			})
			c.Abort()
			return
		} else if m.config.BearerToken != "" {
			token := authHeader[7:]
			if token == m.config.BearerToken {
				c.Next()
				return
			}
		}
	}

	// Check Basic auth
	if strings.HasPrefix(authHeader, "Basic ") {
		if m.validateBasicAuth(authHeader) {
			c.Next()
			return
		}
	}

	// No valid auth provided
	c.Header("WWW-Authenticate", `Basic realm="VibeTunnel"`)
	c.JSON(http.StatusUnauthorized, gin.H{
		"error": "Authentication required",
	})
	c.Abort()
}

// validateBasicAuth validates basic authentication credentials
func (m *Middleware) validateBasicAuth(authHeader string) bool {
	if !strings.HasPrefix(authHeader, "Basic ") {
		return false
	}

	encoded := authHeader[6:]
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return false
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return false
	}

	username := parts[0]
	password := parts[1]

	return username == m.config.BasicAuthUsername && password == m.config.BasicAuthPassword
}