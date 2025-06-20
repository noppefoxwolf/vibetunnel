package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/vibetunnel/vibetunnel-server/pkg/api"
	"github.com/vibetunnel/vibetunnel-server/pkg/auth"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
	"github.com/vibetunnel/vibetunnel-server/pkg/hq"
	"github.com/vibetunnel/vibetunnel-server/pkg/pty"
	"github.com/vibetunnel/vibetunnel-server/pkg/session"
	"github.com/vibetunnel/vibetunnel-server/pkg/stream"
	"github.com/vibetunnel/vibetunnel-server/pkg/terminal"
)

var (
	cfg = config.DefaultConfig()
)

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "vibetunnel-server",
	Short: "VibeTunnel terminal multiplexer server",
	Long:  `A web-based terminal multiplexer with distributed architecture support.`,
	RunE:  runServer,
}

func init() {
	rootCmd.Flags().IntVar(&cfg.Port, "port", cfg.Port, "Server port")
	rootCmd.Flags().StringVar(&cfg.StaticPath, "static", "", "Path to static files (required)")
	rootCmd.MarkFlagRequired("static")
	rootCmd.Flags().StringVar(&cfg.BasicAuthUsername, "username", "", "Basic auth username")
	rootCmd.Flags().StringVar(&cfg.BasicAuthPassword, "password", "", "Basic auth password")
	rootCmd.Flags().BoolVar(&cfg.IsHQMode, "hq", false, "Run as HQ server")
	rootCmd.Flags().StringVar(&cfg.HQUrl, "hq-url", "", "HQ server URL to register with")
	rootCmd.Flags().StringVar(&cfg.HQUsername, "hq-username", "", "Username for HQ authentication")
	rootCmd.Flags().StringVar(&cfg.HQPassword, "hq-password", "", "Password for HQ authentication")
	rootCmd.Flags().StringVar(&cfg.RemoteName, "name", "", "Unique name for this remote server")
	rootCmd.Flags().BoolVar(&cfg.AllowInsecureHQ, "allow-insecure-hq", false, "Allow insecure HTTP for HQ URL")
}

func runServer(cmd *cobra.Command, args []string) error {
	// Load environment variables
	cfg.LoadFromEnv()

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		return err
	}

	// Log authentication status
	if !cfg.HasAuth() {
		log.Println("WARNING: No authentication configured!")
		log.Println("Set VIBETUNNEL_USERNAME and VIBETUNNEL_PASSWORD or use --username and --password flags.")
	}

	// Generate bearer token for remote mode
	if cfg.IsRemoteMode() {
		cfg.BearerToken = uuid.New().String()
	}

	// Create control directory
	if err := os.MkdirAll(cfg.ControlDir, 0755); err != nil {
		return fmt.Errorf("failed to create control directory: %v", err)
	}

	// Initialize services
	ptyManager := pty.NewManager(cfg)
	sessionManager := session.NewManager(cfg, ptyManager)
	terminalManager := terminal.NewManager(cfg)
	streamWatcher := stream.NewWatcher(cfg)
	bufferAggregator := stream.NewBufferAggregator(cfg, terminalManager)

	// Initialize HQ-specific services
	var remoteRegistry *hq.RemoteRegistry
	var hqClient *hq.Client
	if cfg.IsHQMode {
		remoteRegistry = hq.NewRemoteRegistry(cfg)
	} else if cfg.IsRemoteMode() {
		hqClient = hq.NewClient(cfg)
	}

	// Create Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.Logger())

	// Apply authentication middleware
	authMiddleware := auth.NewMiddleware(cfg)
	apiGroup := router.Group("/api")
	apiGroup.Use(authMiddleware)

	// Health check endpoint (no auth)
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "ok",
			"timestamp": time.Now().Format(time.RFC3339),
			"mode":      cfg.GetServerMode(),
		})
	})

	// Register API routes
	apiHandler := api.NewHandler(cfg, sessionManager, terminalManager, streamWatcher, bufferAggregator, remoteRegistry)
	apiHandler.RegisterRoutes(apiGroup)

	// WebSocket server
	wsServer := stream.NewWebSocketServer(cfg, bufferAggregator)
	router.GET("/buffers", wsServer.HandleWebSocket)

	// Static files - serve index.html for all non-API routes
	router.NoRoute(func(c *gin.Context) {
		// If it's an API route, return 404
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}
		
		// Try to serve the exact file first
		filePath := filepath.Join(cfg.StaticPath, c.Request.URL.Path)
		if _, err := os.Stat(filePath); err == nil {
			c.File(filePath)
			return
		}
		
		// Otherwise serve index.html for client-side routing
		c.File(filepath.Join(cfg.StaticPath, "index.html"))
	})

	// Create HTTP server
	srv := &http.Server{
		Addr:    fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler: router,
	}

	// Start control directory watcher
	controlWatcher := session.NewControlDirWatcher(cfg, sessionManager)
	if err := controlWatcher.Start(); err != nil {
		return fmt.Errorf("failed to start control directory watcher: %v", err)
	}

	// Start cleanup timers
	cleanupTicker := time.NewTicker(cfg.CleanupInterval)
	go func() {
		for range cleanupTicker.C {
			terminalManager.CleanupIdleSessions()
		}
	}()

	// Register with HQ if in remote mode
	if cfg.IsRemoteMode() {
		go func() {
			// Give server time to start
			time.Sleep(2 * time.Second)
			if err := hqClient.Register(); err != nil {
				log.Printf("Failed to register with HQ: %v", err)
			}
		}()
	}

	// Start server
	go func() {
		serverAddr := fmt.Sprintf("http://localhost:%d", cfg.Port)
		if cfg.Host != "" {
			serverAddr = fmt.Sprintf("http://%s:%d", cfg.Host, cfg.Port)
		}
		log.Printf("VibeTunnel server (%s mode) listening on %s", cfg.GetServerMode(), serverAddr)

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Shutdown sequence
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Stop services
	cleanupTicker.Stop()
	controlWatcher.Stop()

	// Unregister from HQ
	if hqClient != nil {
		hqClient.Unregister()
	}

	// Stop remote registry
	if remoteRegistry != nil {
		remoteRegistry.Stop()
	}

	// Shutdown HTTP server
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
	return nil
}