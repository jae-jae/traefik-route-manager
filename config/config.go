package config

import (
	"errors"
	"fmt"
	"os"
)

type Config struct {
	Addr      string
	AuthToken string
	ConfigDir string
}

func Load() (Config, error) {
	cfg := Config{
		Addr:      getenv("ADDR", "0.0.0.0:8892"),
		AuthToken: os.Getenv("AUTH_TOKEN"),
		ConfigDir: os.Getenv("CONFIG_DIR"),
	}

	switch {
	case cfg.AuthToken == "":
		return Config{}, errors.New("AUTH_TOKEN is required")
	case cfg.ConfigDir == "":
		return Config{}, errors.New("CONFIG_DIR is required")
	default:
		return cfg, nil
	}
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func (c Config) String() string {
	return fmt.Sprintf("addr=%s config_dir=%s", c.Addr, c.ConfigDir)
}
