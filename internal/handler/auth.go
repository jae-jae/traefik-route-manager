package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	token string
}

type loginRequest struct {
	Token string `json:"token"`
}

func NewAuthHandler(token string) *AuthHandler {
	return &AuthHandler{token: token}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if strings.TrimSpace(req.Token) != h.token {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
