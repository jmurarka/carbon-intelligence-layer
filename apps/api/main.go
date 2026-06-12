package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type contextKey string

const partnerIDKey contextKey = "partnerID"

// CarbonScoreResponse represents the returned payload for product queries.
type CarbonScoreResponse struct {
	SKU                 string             `json:"sku"`
	CO2eKg              float64            `json:"co2e_kg"`
	ConfidenceScore     string             `json:"confidence_score"`
	Tier                string             `json:"tier"`
	CalculationMethod   string             `json:"calculation_method"`
	ComparisonStatement string             `json:"comparison_statement"`
	Breakdown           map[string]float64 `json:"breakdown"`
	CategoryID          string             `json:"category_id,omitempty"`
}

func main() {
	// Load environment variables from .env file if available
	loadEnv()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://postgres:postgres@localhost:5432/carbon_companion?schema=public"
		log.Println("DATABASE_URL not set in environment. Falling back to default.")
	}

	// Connect to database
	log.Println("Connecting to PostgreSQL database...")
	if err := InitDB(dbURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer DB.Close()
	log.Println("Database connection established successfully!")

	// Connect to Redis cache
	redisURL := os.Getenv("REDIS_URL")
	InitCache(redisURL)
	defer func() {
		if RedisClient != nil {
			log.Println("Closing Redis cache connection...")
			RedisClient.Close()
		}
	}()

	// Connect to ClickHouse analytics
	chURL := os.Getenv("CLICKHOUSE_URL")
	InitClickHouse(chURL)
	if ClickHouseConn != nil {
		defer func() {
			log.Println("Closing ClickHouse analytics connection...")
			ClickHouseConn.Close()
		}()
	}
	go StartLogConsumer()

	mux := http.NewServeMux()

		// Endpoints with Authentication Middleware
	mux.HandleFunc("/v1/scores/product", authMiddleware(handleProductScore))
	mux.HandleFunc("/v1/scores/batch", authMiddleware(handleBatchScores))
	mux.HandleFunc("/v1/scores/checkout", authMiddleware(handleCheckoutScore))
	mux.HandleFunc("/v1/scores/suggestions", authMiddleware(handleSuggestions))
	mux.HandleFunc("/v1/catalog/upload", authMiddleware(handleCatalogUpload))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	fmt.Printf("Carbon Companion API Server starting on port %s...\n", port)
	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatalf("Server startup failed: %s", err)
	}
}

// Simple Env Parser to avoid third-party libraries for MVP
func loadEnv() {
	// Try root directory .env or local directory .env
	envPaths := []string{"../../.env", "./.env", "../.env"}
	for _, path := range envPaths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if len(line) == 0 || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				// Strip quotes
				if strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"") {
					val = val[1 : len(val)-1]
				}
				os.Setenv(key, val)
			}
		}
		break
	}
}

// Authentication Middleware
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error": "Unauthorized. Bearer token missing."}`))
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error": "Unauthorized. Invalid token."}`))
			return
		}

		// Verify key hash against DB
		partnerID, err := GetPartnerIDByToken(token)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error": "Unauthorized. %v"}`, err)))
			return
		}

		ctx := context.WithValue(r.Context(), partnerIDKey, partnerID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// CORS Middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Content-Type", "application/json")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Handler for single product score lookup
func handleProductScore(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error": "Method not allowed"}`))
		return
	}

	partnerID, ok := r.Context().Value(partnerIDKey).(string)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Internal Context Error"}`))
		return
	}

	sku := r.URL.Query().Get("sku")
	if sku == "" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Missing required query parameter: 'sku'"}`))
		return
	}

	title := r.URL.Query().Get("title")
	category := r.URL.Query().Get("category")

	weightGrams := 0
	if wgStr := r.URL.Query().Get("weight_grams"); wgStr != "" {
		if val, err := strconv.Atoi(wgStr); err == nil {
			weightGrams = val
		}
	}

	score, err := ResolveProductScore(partnerID, sku, weightGrams, title, category)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"error": "Failed to resolve score: %v"}`, err)))
		return
	}

	latencyMs := time.Since(startTime).Milliseconds()
	LogEvent(r, partnerID, "score_lookup", score.SKU, score.CategoryID, score.CO2eKg, 0.0, latencyMs)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(score)
}

type BatchRequestItem struct {
	SKU         string `json:"sku"`
	Title       string `json:"title"`
	WeightGrams int    `json:"weight_grams"`
}

type BatchRequest struct {
	Items []BatchRequestItem `json:"items"`
}

type BatchResponseResult struct {
	SKU               string  `json:"sku"`
	CO2eKg            float64 `json:"co2e_kg"`
	Tier              string  `json:"tier"`
	CalculationMethod string  `json:"calculation_method"`
}

type BatchResponse struct {
	Results []BatchResponseResult `json:"results"`
}

// Handler for batch lookups
func handleBatchScores(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error": "Method not allowed"}`))
		return
	}

	partnerID, ok := r.Context().Value(partnerIDKey).(string)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Internal Context Error"}`))
		return
	}

	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Invalid JSON payload"}`))
		return
	}

	if len(req.Items) > 50 {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Batch limits exceeded. Max 50 items allowed per batch."}`))
		return
	}

	results := make([]BatchResponseResult, 0, len(req.Items))
	for _, item := range req.Items {
		score, err := ResolveProductScore(partnerID, item.SKU, item.WeightGrams, item.Title, "")
		if err != nil {
			continue // skip errors dynamically in batch lookup
		}
		results = append(results, BatchResponseResult{
			SKU:               item.SKU,
			CO2eKg:            score.CO2eKg,
			Tier:              score.Tier,
			CalculationMethod: score.CalculationMethod,
		})

		// Log individual item lookup within the batch
		LogEvent(r, partnerID, "score_lookup", item.SKU, score.CategoryID, score.CO2eKg, 0.0, 0)
	}

	// Log overall batch query event
	latencyMs := time.Since(startTime).Milliseconds()
	LogEvent(r, partnerID, "batch_score_lookup", "", "", 0.0, 0.0, latencyMs)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(BatchResponse{Results: results})
}

type CheckoutRequestItem struct {
	SKU        string `json:"sku"`
	Quantity   int    `json:"quantity"`
	PriceCents int    `json:"price_cents"`
}

type CheckoutLogistics struct {
	TransportMode string  `json:"transport_mode"`
	DistanceKm    float64 `json:"distance_km"`
}

type CheckoutRequest struct {
	Items     []CheckoutRequestItem `json:"items"`
	Logistics CheckoutLogistics     `json:"logistics"`
}

type CheckoutComparisons struct {
	MilesDriven      float64 `json:"miles_driven"`
	TreeDaysAbsorbed float64 `json:"tree_days_absorbed"`
}

type CheckoutOffsetOptions struct {
	SuggestedOffsetCents int             `json:"suggested_offset_cents"`
	ProjectName          string          `json:"project_name"`
	Projects             []OffsetProject `json:"projects"`
}

type CheckoutResponse struct {
	OrderTotalCO2eKg  float64               `json:"order_total_co2e_kg"`
	LogisticsCO2eKg   float64               `json:"logistics_co2e_kg"`
	GrandTotalCO2eKg  float64               `json:"grand_total_co2e_kg"`
	Comparisons       CheckoutComparisons   `json:"comparisons"`
	OffsetOptions     CheckoutOffsetOptions `json:"offset_options"`
}

// Handler for checkout order computations
func handleCheckoutScore(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error": "Method not allowed"}`))
		return
	}

	partnerID, ok := r.Context().Value(partnerIDKey).(string)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Internal Context Error"}`))
		return
	}

	var req CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Invalid JSON payload"}`))
		return
	}

	var productTotalCO2e float64
	var totalWeightGrams int

	for _, item := range req.Items {
		unitWeight := 0
		catItem, err := GetCatalogItem(partnerID, item.SKU)
		if err == nil && catItem != nil {
			unitWeight = catItem.WeightGrams
		}

		score, err := ResolveProductScore(partnerID, item.SKU, unitWeight, "", "")
		if err != nil {
			continue
		}
		productTotalCO2e += score.CO2eKg * float64(item.Quantity)
		totalWeightGrams += unitWeight * item.Quantity
	}

	var logisticsCO2e float64
	if req.Logistics.TransportMode != "" && req.Logistics.DistanceKm > 0 {
		tf, err := GetTransportFactor(req.Logistics.TransportMode)
		if err == nil && tf != nil {
			// co2e_per_km_ton * distance_km * tons
			totalTons := float64(totalWeightGrams) / 1000000.0
			if totalTons > 0 && tf.CO2ePerKmTon > 0 {
				logisticsCO2e = tf.CO2ePerKmTon * req.Logistics.DistanceKm * totalTons
			} else {
				// Fallback to passenger/unit distance calculations
				logisticsCO2e = tf.CO2ePerKmPassenger * req.Logistics.DistanceKm
			}
		}
	}

	grandTotal := productTotalCO2e + logisticsCO2e

	// 1 mile driven = ~0.4 kg CO2e
	milesDriven := grandTotal / 0.40
	// 1 tree absorbs ~0.06 kg CO2e per day (22 kg per year)
	treeDays := grandTotal / 0.06

	// Compute dynamic offsets from cloverly/patch registry
	offsetProjects, err := CalculateOffsetsForGrandTotal(grandTotal)
	suggestedOffset := 0
	suggestedName := ""
	if err == nil && len(offsetProjects) > 0 {
		suggestedOffset = offsetProjects[0].CalculatedCostCents
		suggestedName = offsetProjects[0].Name
	}

	response := CheckoutResponse{
		OrderTotalCO2eKg:  math.Round(productTotalCO2e*100) / 100,
		LogisticsCO2eKg:   math.Round(logisticsCO2e*100) / 100,
		GrandTotalCO2eKg:  math.Round(grandTotal*100) / 100,
		Comparisons: CheckoutComparisons{
			MilesDriven:      math.Round(milesDriven*10) / 10,
			TreeDaysAbsorbed: math.Round(treeDays),
		},
		OffsetOptions: CheckoutOffsetOptions{
			SuggestedOffsetCents: suggestedOffset,
			ProjectName:          suggestedName,
			Projects:             offsetProjects,
		},
	}

	latencyMs := time.Since(startTime).Milliseconds()
	LogEvent(r, partnerID, "checkout_summary", "", "", grandTotal, 0.0, latencyMs)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

type SuggestionResponseItem struct {
	SKU         string  `json:"sku"`
	Title       string  `json:"title"`
	CO2eKg      float64 `json:"co2e_kg"`
	CO2eSavedKg float64 `json:"co2e_saved_kg"`
	PriceCents  int     `json:"price_cents"`
	Reasoning   string  `json:"reasoning"`
}

type SuggestionsResponse struct {
	OriginalSKU    string                   `json:"original_sku"`
	OriginalCO2eKg float64                  `json:"original_co2e_kg"`
	Suggestions    []SuggestionResponseItem `json:"suggestions"`
}

func handleSuggestions(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error": "Method not allowed"}`))
		return
	}

	partnerID, ok := r.Context().Value(partnerIDKey).(string)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Internal Context Error"}`))
		return
	}

	sku := r.URL.Query().Get("sku")
	if sku == "" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Missing required query parameter: 'sku'"}`))
		return
	}

	limit := 3
	if limStr := r.URL.Query().Get("limit"); limStr != "" {
		if val, err := strconv.Atoi(limStr); err == nil {
			limit = val
		}
	}

	// 1. Resolve original item footprint
	catItem, err := GetCatalogItem(partnerID, sku)
	if err != nil || catItem == nil {
		// If original product is unknown, we cannot suggest alternatives
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"original_sku": "%s", "original_co2e_kg": 0.0, "suggestions": []}`, sku)))
		return
	}

	origScore, err := ResolveProductScore(partnerID, sku, catItem.WeightGrams, "", "")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Failed to resolve original score"}`))
		return
	}

	// 2. Fetch alternative items in the same category
	altItems, err := GetSuggestionsForCategory(partnerID, catItem.CategoryID, sku, limit*2)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Failed to fetch alternative items"}`))
		return
	}

	suggestions := make([]SuggestionResponseItem, 0, limit)
	for _, alt := range altItems {
		altScore, err := ResolveProductScore(partnerID, alt.SKU, alt.WeightGrams, "", "")
		if err != nil {
			continue
		}

		saved := origScore.CO2eKg - altScore.CO2eKg
		if saved > 0 {
			reason := "Choosing this item reduces lifecycle assessment production impact."
			if strings.Contains(strings.ToLower(alt.Title), "local") {
				reason = "Local distribution reduces transport and processing emissions."
			} else if strings.Contains(strings.ToLower(alt.Title), "oat") && strings.Contains(strings.ToLower(catItem.Title), "almond") {
				reason = "Oat production uses significantly less land and water than almonds."
			}

			// Mock price cents (generally ~10% variation on original or standard values)
			mockPrice := 399
			if strings.Contains(strings.ToLower(alt.Title), "local") {
				mockPrice = 420
			}

			suggestions = append(suggestions, SuggestionResponseItem{
				SKU:         alt.SKU,
				Title:       alt.Title,
				CO2eKg:      altScore.CO2eKg,
				CO2eSavedKg: math.Round(saved*100) / 100,
				PriceCents:  mockPrice,
				Reasoning:   reason,
			})
		}

		if len(suggestions) >= limit {
			break
		}
	}

	response := SuggestionsResponse{
		OriginalSKU:    sku,
		OriginalCO2eKg: origScore.CO2eKg,
		Suggestions:    suggestions,
	}

	latencyMs := time.Since(startTime).Milliseconds()
	LogEvent(r, partnerID, "suggestions_lookup", sku, catItem.CategoryID, origScore.CO2eKg, 0.0, latencyMs)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

type CatalogUploadItem struct {
	SKU   string `json:"sku"`
	Title string `json:"title"`
	GTIN  string `json:"gtin"`
}

type CatalogUploadRequest struct {
	Products []CatalogUploadItem `json:"products"`
}

type CatalogUploadResult struct {
	SKU          string  `json:"sku"`
	CategoryName string  `json:"category_name"`
	CategoryID   string  `json:"category_id"`
	Confidence   float64 `json:"confidence"`
	Status       string  `json:"status"` // "classified" | "unclassified" | "failed"
}

type CatalogUploadResponse struct {
	ProcessedCount int                   `json:"processed_count"`
	Results        []CatalogUploadResult `json:"results"`
}

// Handler for custom product catalog uploads (Phase 2 Classification Engine)
func handleCatalogUpload(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error": "Method not allowed"}`))
		return
	}

	partnerID, ok := r.Context().Value(partnerIDKey).(string)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "Internal Context Error"}`))
		return
	}

	var req CatalogUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error": "Invalid JSON payload"}`))
		return
	}

	results := make([]CatalogUploadResult, 0, len(req.Products))
	for _, item := range req.Products {
		catID, catName, conf := ClassifyProductTitle(item.Title)
		status := "classified"
		if catID == "" {
			status = "unclassified"
		} else {
			// Save dynamically to database
			err := SaveCatalogItem(partnerID, item.SKU, item.GTIN, item.Title, catID)
			if err != nil {
				status = "failed"
			}
		}

		results = append(results, CatalogUploadResult{
			SKU:          item.SKU,
			CategoryName: catName,
			CategoryID:   catID,
			Confidence:   math.Round(conf*100) / 100,
			Status:       status,
		})
	}

	// Log overall catalog upload event
	latencyMs := time.Since(startTime).Milliseconds()
	LogEvent(r, partnerID, "catalog_upload", "", "", 0.0, 0.0, latencyMs)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(CatalogUploadResponse{
		ProcessedCount: len(req.Products),
		Results:        results,
	})
}

