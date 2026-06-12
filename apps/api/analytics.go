package main

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
)

// UsageLog represents the database model for ClickHouse events
type UsageLog struct {
	EventTime      time.Time
	EventDate      time.Time
	PartnerID      string
	ClientIP       string
	DeviceType     string
	ActionType     string
	SKU            string
	CategoryID     string
	CO2eCalculated float32
	CO2eSaved      float32
	LatencyMs      uint32
}

// Global logger channels and connections
var (
	LogChan        chan UsageLog
	ClickHouseConn driver.Conn
)

// InitClickHouse opens a connection to ClickHouse and instantiates the LogChan buffer
func InitClickHouse(connStr string) {
	LogChan = make(chan UsageLog, 1000)

	if connStr == "" {
		log.Println("CLICKHOUSE_URL not set. Running in analytics bypass mode.")
		ClickHouseConn = nil
		return
	}

	opts, err := clickhouse.ParseDSN(connStr)
	if err != nil {
		log.Printf("Warning: Failed to parse ClickHouse DSN %q: %v. Running in analytics bypass mode.", connStr, err)
		ClickHouseConn = nil
		return
	}



	conn, err := clickhouse.Open(opts)
	if err != nil {
		log.Printf("Warning: ClickHouse open connection failed: %v. Running in analytics bypass mode.", err)
		ClickHouseConn = nil
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := conn.Ping(ctx); err != nil {
		log.Printf("Warning: ClickHouse ping failed: %v. Running in analytics bypass mode.", err)
		ClickHouseConn = nil
		return
	}

	ClickHouseConn = conn
	log.Println("ClickHouse analytics connection established successfully!")
}

// StartLogConsumer starts the background consumer to batch usage logs and write to ClickHouse
func StartLogConsumer() {
	if LogChan == nil {
		return
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	var batch []UsageLog
	maxBatchSize := 100

	flush := func() {
		if len(batch) == 0 {
			return
		}

		if ClickHouseConn == nil {
			log.Printf("Analytics (bypass mode): Flushed %d usage logs.", len(batch))
			for _, item := range batch {
				log.Printf(" -> [Event] partner=%s action=%s sku=%s latency=%dms",
					item.PartnerID, item.ActionType, item.SKU, item.LatencyMs)
			}
		} else {
			ctx := context.Background()
			chBatch, err := ClickHouseConn.PrepareBatch(ctx, "INSERT INTO usage_logs")
			if err != nil {
				log.Printf("Error: ClickHouse PrepareBatch failed: %v", err)
				// Discard logs to prevent memory leaks
				batch = nil
				return
			}

			for _, item := range batch {
				// Parse partner UUID or default to empty UUID
				pUUID, err := uuid.Parse(item.PartnerID)
				if err != nil {
					pUUID = uuid.Nil
				}

				err = chBatch.Append(
					item.EventTime,
					item.EventDate,
					pUUID,
					item.ClientIP,
					item.DeviceType,
					item.ActionType,
					item.SKU,
					item.CategoryID,
					item.CO2eCalculated,
					item.CO2eSaved,
					item.LatencyMs,
				)
				if err != nil {
					log.Printf("Warning: Failed to append log row: %v", err)
				}
			}

			if err := chBatch.Send(); err != nil {
				log.Printf("Error: ClickHouse batch send failed: %v", err)
			}
		}
		batch = nil
	}

	for {
		select {
		case logEntry, ok := <-LogChan:
			if !ok {
				flush()
				return
			}
			batch = append(batch, logEntry)
			if len(batch) >= maxBatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// LogEvent adds an event to the non-blocking channel buffer
func LogEvent(r *http.Request, partnerID string, action string, sku string, categoryID string, co2e float64, co2eSaved float64, latencyMs int64) {
	if LogChan == nil {
		return
	}

	clientIP := "127.0.0.1"
	if r != nil {
		clientIP = r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			clientIP = strings.Split(xff, ",")[0]
		}
	}

	deviceType := "web"
	if r != nil {
		ua := strings.ToLower(r.Header.Get("User-Agent"))
		if strings.Contains(ua, "iphone") || strings.Contains(ua, "android") || strings.Contains(ua, "mobile") {
			deviceType = "mobile_app"
		}
	}

	logEntry := UsageLog{
		EventTime:      time.Now(),
		EventDate:      time.Now(),
		PartnerID:      partnerID,
		ClientIP:       clientIP,
		DeviceType:     deviceType,
		ActionType:     action,
		SKU:            sku,
		CategoryID:     categoryID,
		CO2eCalculated: float32(co2e),
		CO2eSaved:      float32(co2eSaved),
		LatencyMs:      uint32(latencyMs),
	}

	select {
	case LogChan <- logEntry:
	default:
		// Graceful load shedding under high peak load
		log.Println("Warning: Analytics event queue full. Dropped log row.")
	}
}
