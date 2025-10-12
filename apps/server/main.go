package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/grpc"
	"github.com/grpc-bridge/server/internal/handler"
	"github.com/grpc-bridge/server/internal/middleware"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/storage"
)

func main() {
	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize services
	sessionManager := session.NewManager()
	fileStorage := storage.NewFileStorage("./uploads")
	grpcProxy := grpc.NewProxy()

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
				"status": "ok",
				"service": "grpc-bridge-web-api",
			})
		})

		// Session routes
		sessionHandler := handler.NewSessionHandler(sessionManager)
		api.POST("/sessions", sessionHandler.CreateSession)
		api.GET("/sessions/:sessionId", sessionHandler.GetSession)
		api.DELETE("/sessions/:sessionId", sessionHandler.DeleteSession)

		// File upload routes
		fileHandler := handler.NewFileHandler(sessionManager, fileStorage)
		api.POST("/upload/proto", fileHandler.UploadProtoFiles)
		api.GET("/sessions/:sessionId/files", fileHandler.ListFiles)

		// gRPC proxy routes
		grpcHandler := handler.NewGRPCHandler(sessionManager, grpcProxy)
		api.POST("/grpc/call", grpcHandler.CallGRPC)
		api.POST("/grpc/services", grpcHandler.ListServices)
		api.POST("/grpc/describe", grpcHandler.DescribeService)
	}

	log.Printf("Starting gRPC Bridge Web API on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
