package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisClient is the global Redis connection pool
var RedisClient *redis.Client

// InitCache initializes connection to Redis, falling back gracefully to bypass mode if failed.
func InitCache(redisURL string) {
	if redisURL == "" {
		log.Println("REDIS_URL not set. Running in cache bypass mode.")
		RedisClient = nil
		return
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("Warning: Failed to parse REDIS_URL %q: %v. Running in cache bypass mode.", redisURL, err)
		RedisClient = nil
		return
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis server connection ping failed: %v. Running in cache bypass mode.", err)
		RedisClient = nil
		return
	}

	RedisClient = client
	log.Println("Redis cache client connected successfully!")
}

// getCacheKey formats Redis keys for catalog items
func getCacheKey(partnerID, sku string) string {
	return fmt.Sprintf("catalog:%s:%s", partnerID, sku)
}

// GetCachedCatalogItem retrieves catalog item from Redis cache
func GetCachedCatalogItem(partnerID, sku string) (*CatalogItem, error) {
	if RedisClient == nil {
		return nil, nil
	}

	ctx := context.Background()
	key := getCacheKey(partnerID, sku)

	val, err := RedisClient.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil // Cache miss
	} else if err != nil {
		return nil, fmt.Errorf("redis error on GET: %w", err)
	}

	var item CatalogItem
	if err := json.Unmarshal([]byte(val), &item); err != nil {
		return nil, fmt.Errorf("failed to unmarshal cached catalog item: %w", err)
	}

	return &item, nil
}

// SetCachedCatalogItem writes a catalog item to Redis cache with a 24-hour expiration
func SetCachedCatalogItem(partnerID, sku string, item *CatalogItem) error {
	if RedisClient == nil || item == nil {
		return nil
	}

	ctx := context.Background()
	key := getCacheKey(partnerID, sku)

	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("failed to marshal catalog item: %w", err)
	}

	// Cache for 24 hours
	err = RedisClient.Set(ctx, key, data, 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("redis error on SET: %w", err)
	}

	return nil
}

// InvalidateCachedCatalogItem evicts a catalog item from cache
func InvalidateCachedCatalogItem(partnerID, sku string) error {
	if RedisClient == nil {
		return nil
	}

	ctx := context.Background()
	key := getCacheKey(partnerID, sku)

	err := RedisClient.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("redis error on DEL: %w", err)
	}

	return nil
}
