package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config holds all configuration for the VibeTunnel server
type Config struct {
	// Server settings
	Port       int    `mapstructure:"port"`
	Host       string `mapstructure:"host"`
	StaticPath string `mapstructure:"static_path"`

	// Authentication
	BasicAuthUsername string `mapstructure:"username"`
	BasicAuthPassword string `mapstructure:"password"`

	// HQ Mode settings
	IsHQMode         bool   `mapstructure:"hq"`
	HQUrl            string `mapstructure:"hq_url"`
	HQUsername       string `mapstructure:"hq_username"`
	HQPassword       string `mapstructure:"hq_password"`
	RemoteName       string `mapstructure:"name"`
	AllowInsecureHQ  bool   `mapstructure:"allow_insecure_hq"`
	BearerToken      string // Generated for remote mode

	// Directories
	ControlDir string `mapstructure:"control_dir"`

	// Terminal defaults
	DefaultCols      int    `mapstructure:"default_cols"`
	DefaultRows      int    `mapstructure:"default_rows"`
	DefaultTerm      string `mapstructure:"default_term"`
	ScrollbackBuffer int    `mapstructure:"scrollback_buffer"`

	// Timeouts and intervals
	CleanupInterval       time.Duration `mapstructure:"cleanup_interval"`
	SessionIdleTimeout    time.Duration `mapstructure:"session_idle_timeout"`
	HealthCheckInterval   time.Duration `mapstructure:"health_check_interval"`
	HealthCheckTimeout    time.Duration `mapstructure:"health_check_timeout"`
	RequestTimeout        time.Duration `mapstructure:"request_timeout"`
	WebSocketPingInterval time.Duration `mapstructure:"websocket_ping_interval"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	homeDir, _ := os.UserHomeDir()
	controlDir := filepath.Join(homeDir, ".vibetunnel", "control")

	return &Config{
		Port: 4020,
		Host: "",

		ControlDir: controlDir,

		DefaultCols:      80,
		DefaultRows:      24,
		DefaultTerm:      "xterm-256color",
		ScrollbackBuffer: 10000,

		CleanupInterval:       5 * time.Minute,
		SessionIdleTimeout:    30 * time.Minute,
		HealthCheckInterval:   15 * time.Second,
		HealthCheckTimeout:    5 * time.Second,
		RequestTimeout:        10 * time.Second,
		WebSocketPingInterval: 30 * time.Second,
	}
}

// LoadFromEnv loads configuration from environment variables
func (c *Config) LoadFromEnv() {
	if port := os.Getenv("PORT"); port != "" {
		if _, err := fmt.Sscanf(port, "%d", &c.Port); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Invalid PORT value: %s\n", port)
		}
	}

	if username := os.Getenv("VIBETUNNEL_USERNAME"); username != "" && c.BasicAuthUsername == "" {
		c.BasicAuthUsername = username
	}

	if password := os.Getenv("VIBETUNNEL_PASSWORD"); password != "" && c.BasicAuthPassword == "" {
		c.BasicAuthPassword = password
	}

	if controlDir := os.Getenv("VIBETUNNEL_CONTROL_DIR"); controlDir != "" {
		c.ControlDir = controlDir
	}
}

// Validate validates the configuration
func (c *Config) Validate() error {
	// Validate static path
	if c.StaticPath == "" {
		return fmt.Errorf("static path is required")
	}
	if _, err := os.Stat(c.StaticPath); err != nil {
		return fmt.Errorf("static path does not exist: %s", c.StaticPath)
	}
	// Validate HQ mode settings
	if c.HQUrl != "" {
		if c.IsHQMode {
			return fmt.Errorf("cannot specify both --hq and --hq-url")
		}

		if !c.AllowInsecureHQ && !strings.HasPrefix(c.HQUrl, "https://") {
			return fmt.Errorf("HQ URL must use HTTPS (use --allow-insecure-hq to override)")
		}

		if c.RemoteName == "" {
			return fmt.Errorf("--name is required when using --hq-url")
		}

		if c.HQUsername == "" || c.HQPassword == "" {
			return fmt.Errorf("--hq-username and --hq-password are required when using --hq-url")
		}
	}

	// Validate port
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("invalid port: %d", c.Port)
	}

	// Validate terminal settings
	if c.DefaultCols < 1 || c.DefaultCols > 1000 {
		return fmt.Errorf("invalid default columns: %d", c.DefaultCols)
	}

	if c.DefaultRows < 1 || c.DefaultRows > 1000 {
		return fmt.Errorf("invalid default rows: %d", c.DefaultRows)
	}

	return nil
}

// IsRemoteMode returns true if this server is configured as a remote
func (c *Config) IsRemoteMode() bool {
	return c.HQUrl != ""
}

// HasAuth returns true if authentication is configured
func (c *Config) HasAuth() bool {
	return c.BasicAuthUsername != "" && c.BasicAuthPassword != ""
}

// GetServerMode returns a string describing the server mode
func (c *Config) GetServerMode() string {
	if c.IsHQMode {
		return "hq"
	}
	if c.IsRemoteMode() {
		return "remote"
	}
	return "normal"
}