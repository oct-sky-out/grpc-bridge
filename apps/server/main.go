package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/grpc"
	"github.com/grpc-bridge/server/internal/handler"
	"github.com/grpc-bridge/server/internal/middleware"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/static"
	"github.com/grpc-bridge/server/internal/websocket"
)

func main() {
	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize upload directory
	uploadDir := "./uploads"
	if dir := os.Getenv("UPLOAD_DIR"); dir != "" {
		uploadDir = dir
	}

	// Initialize services
	sessionManager := session.NewManager(uploadDir)
	grpcProxy := grpc.NewProxy()
	wsHub := websocket.NewHub()

	// Create Gin router
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORS())
	router.Use(middleware.Logger())

	// API routes
	api := router.Group("/api")
	{
		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status":  "ok",
				"service": "grpc-bridge-web-api",
			})
		})

		// WebSocket route
		wsHandler := handler.NewWebSocketHandler(wsHub)
		api.GET("/ws", wsHandler.HandleConnection)

		// Session routes
		sessionHandler := handler.NewSessionHandler(sessionManager)
		api.POST("/sessions", sessionHandler.CreateSession)
		api.GET("/sessions/:sessionId", sessionHandler.GetSession)
		api.DELETE("/sessions/:sessionId", sessionHandler.DeleteSession)

		// Proto file routes (directory structure)
		protoHandler := handler.NewProtoHandler(sessionManager, wsHub, uploadDir)
		api.POST("/proto/upload-structure", protoHandler.UploadStructure)
		api.GET("/sessions/:sessionId/files", protoHandler.ListFiles)
		api.GET("/sessions/:sessionId/file-content", protoHandler.GetFileContent)
		api.GET("/sessions/:sessionId/analyze", protoHandler.AnalyzeDependencies)
		api.GET("/proto/stdlib", protoHandler.ListStdlibFiles)
		api.GET("/proto/stdlib-content", protoHandler.GetStdlibFileContent)

		// gRPC proxy routes
		grpcHandler := handler.NewGRPCHandler(sessionManager, grpcProxy, wsHub)
		api.POST("/grpc/call", grpcHandler.CallGRPC)
		api.POST("/grpc/services", grpcHandler.ListServices)
		api.POST("/grpc/describe", grpcHandler.DescribeService)
	}

	// Serve static files (embedded frontend)
	staticHandler, err := static.GetFileServer()
	if err != nil {
		log.Printf("[Warning] Failed to load embedded static files: %v", err)
		log.Println("[Warning] Static file serving disabled")
	} else {
		// Serve index.html for SPA routes
		router.NoRoute(gin.WrapH(staticHandler))
		log.Println("[Static] Serving embedded frontend from /")
	}

	log.Printf("Starting gRPC Bridge Web API on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
