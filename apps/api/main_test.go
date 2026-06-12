package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCORSHeaders(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/scores/product", authMiddleware(handleProductScore))
	
	req, _ := http.NewRequest("OPTIONS", "/v1/scores/product", nil)
	rr := httptest.NewRecorder()

	corsMiddleware(mux).ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("CORS origin header mismatch: got %v want *", origin)
	}
}

func TestAuthMiddleware(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/scores/product", authMiddleware(handleProductScore))
	
	// Test unauthorized request
	req, _ := http.NewRequest("GET", "/v1/scores/product?sku=sku-almondmilk-002", nil)
	rr := httptest.NewRecorder()
	corsMiddleware(mux).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("unauthorized request did not return 401: got %v", rr.Code)
	}

	// Test authorized request
	req, _ = http.NewRequest("GET", "/v1/scores/product?sku=sku-almondmilk-002", nil)
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	rr = httptest.NewRecorder()
	corsMiddleware(mux).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("authorized request returned error code: got %v, body: %s", rr.Code, rr.Body.String())
	}
}

func TestProductScoreHandler(t *testing.T) {
	req, _ := http.NewRequest("GET", "/v1/scores/product?sku=sku-almondmilk-002", nil)
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleProductScore)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res CarbonScoreResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse response body: %v", err)
	}

	if res.SKU != "sku-almondmilk-002" {
		t.Errorf("wrong SKU returned: got %s", res.SKU)
	}

	// Almond Milk factor is 2.50, weight is 1000g (1.0 kg). 2.50 * 1.0 = 2.50 kg CO2e
	if res.CO2eKg != 2.50 {
		t.Errorf("wrong carbon score returned: got %f, want 2.50", res.CO2eKg)
	}

	if res.Tier != "medium" {
		t.Errorf("wrong impact tier: got %s, want medium", res.Tier)
	}
}

func TestBatchScoresHandler(t *testing.T) {
	payload := `{"items":[{"sku":"sku-almondmilk-002", "weight_grams": 1000}, {"sku":"sku-beefsteak-003", "weight_grams": 400}]}`
	req, _ := http.NewRequest("POST", "/v1/scores/batch", strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleBatchScores)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res BatchResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if len(res.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(res.Results))
	}

	if res.Results[0].SKU != "sku-almondmilk-002" || res.Results[0].CO2eKg != 2.50 {
		t.Errorf("wrong batch result for item 0: %+v", res.Results[0])
	}
}

func TestCheckoutScoreHandler(t *testing.T) {
	// 2x Almond Milk (2 * 2.5kg = 5.0kg)
	// 1x Premium Beef Steak (1 * (12.0kg * 0.4kg) = 4.8kg)
	// Total product footprint = 9.8 kg
	// Weight total = 2x1000g + 1x400g = 2400g (0.0024 tons)
	// Logistics = diesel_van (0.25 co2e_per_km_ton) * 10 km * 0.0024 tons = 0.006 kg CO2e
	// Grand total = 9.806 kg
	payload := `{
		"items": [
			{"sku": "sku-almondmilk-002", "quantity": 2},
			{"sku": "sku-beefsteak-003", "quantity": 1}
		],
		"logistics": {
			"transport_mode": "diesel_van",
			"distance_km": 10.0
		}
	}`

	req, _ := http.NewRequest("POST", "/v1/scores/checkout", strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleCheckoutScore)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res CheckoutResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse checkout response: %v", err)
	}

	if res.OrderTotalCO2eKg != 9.80 {
		t.Errorf("wrong product order total: got %f, want 9.80", res.OrderTotalCO2eKg)
	}

	if res.LogisticsCO2eKg != 0.01 { // rounded from 0.006
		t.Errorf("wrong logistics total: got %f, want 0.01", res.LogisticsCO2eKg)
	}

	if res.GrandTotalCO2eKg != 9.81 {
		t.Errorf("wrong grand total: got %f, want 9.81", res.GrandTotalCO2eKg)
	}

	// Suggested offset: grand total (9.81) * 3.5 = 34.33 cents -> rounded up to 35 cents
	if res.OffsetOptions.SuggestedOffsetCents != 35 {
		t.Errorf("wrong offset suggestion: got %d, want 35", res.OffsetOptions.SuggestedOffsetCents)
	}

	if res.OffsetOptions.ProjectName != "Reforestation in Pacific Northwest" {
		t.Errorf("wrong offset project name: got %s, want Reforestation in Pacific Northwest", res.OffsetOptions.ProjectName)
	}

	if len(res.OffsetOptions.Projects) != 3 {
		t.Fatalf("expected 3 offset projects, got %d", len(res.OffsetOptions.Projects))
	}

	// Verify reforestation costs
	p0 := res.OffsetOptions.Projects[0]
	if p0.ID != "proj-reforest-pnw" || p0.CalculatedCostCents != 35 {
		t.Errorf("forestry project mismatch: %+v", p0)
	}

	// Verify soil carbon costs
	p1 := res.OffsetOptions.Projects[1]
	if p1.ID != "proj-soil-midwest" || p1.CalculatedCostCents != 20 {
		t.Errorf("soil project mismatch: %+v", p1)
	}

	// Verify direct air capture costs
	p2 := res.OffsetOptions.Projects[2]
	if p2.ID != "proj-dac-climeworks" || p2.CalculatedCostCents != 148 {
		t.Errorf("dac project mismatch: %+v", p2)
	}
}

func TestSuggestionsHandler(t *testing.T) {
	req, _ := http.NewRequest("GET", "/v1/scores/suggestions?sku=sku-almondmilk-002&limit=2", nil)
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleSuggestions)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var res SuggestionsResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse suggestions response: %v", err)
	}

	if res.OriginalSKU != "sku-almondmilk-002" {
		t.Errorf("wrong original SKU: got %s", res.OriginalSKU)
	}

	if len(res.Suggestions) == 0 {
		t.Errorf("no suggestions returned")
	}
}

func TestAuthFail(t *testing.T) {
	req, _ := http.NewRequest("GET", "/v1/scores/product?sku=sku-almondmilk-002", nil)
	req.Header.Set("Authorization", "Bearer cc_live_badkey")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleProductScore)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", rr.Code)
	}
}

func TestInvalidPayload(t *testing.T) {
	req, _ := http.NewRequest("POST", "/v1/scores/batch", bytes.NewBuffer([]byte(`{invalid: json`)))
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleBatchScores)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", rr.Code)
	}
}

func TestCatalogUploadHandler(t *testing.T) {
	payload := `{
		"products": [
			{"sku": "sku-yogurt-999", "title": "Organic Strawberry Greek Yogurt 150g", "gtin": "123456789012"},
			{"sku": "sku-macbook-888", "title": "Apple MacBook Pro M3 16-inch", "gtin": "123456789013"},
			{"sku": "sku-unknown-777", "title": "Random Toothbrush", "gtin": "123456789014"}
		]
	}`

	req, _ := http.NewRequest("POST", "/v1/catalog/upload", strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer cc_live_testkey123")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler := authMiddleware(handleCatalogUpload)
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rr.Code, rr.Body.String())
	}

	var res CatalogUploadResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if res.ProcessedCount != 3 {
		t.Errorf("expected processed count of 3, got %d", res.ProcessedCount)
	}

	if len(res.Results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(res.Results))
	}

	// Verify Yogurt matching
	yogurt := res.Results[0]
	if yogurt.SKU != "sku-yogurt-999" {
		t.Errorf("expected first SKU to be sku-yogurt-999, got %s", yogurt.SKU)
	}
	if yogurt.Status != "classified" || yogurt.CategoryID != "category-dairy-eggs" || yogurt.CategoryName != "Dairy & Eggs" {
		t.Errorf("yogurt classification mismatch: %+v", yogurt)
	}
	if yogurt.Confidence <= 0 {
		t.Errorf("expected positive confidence for yogurt, got %f", yogurt.Confidence)
	}

	// Verify MacBook matching
	macbook := res.Results[1]
	if macbook.SKU != "sku-macbook-888" {
		t.Errorf("expected second SKU to be sku-macbook-888, got %s", macbook.SKU)
	}
	if macbook.Status != "classified" || macbook.CategoryID != "category-laptops" || macbook.CategoryName != "Laptops" {
		t.Errorf("macbook classification mismatch: %+v", macbook)
	}

	// Verify Toothbrush matching
	toothbrush := res.Results[2]
	if toothbrush.SKU != "sku-unknown-777" {
		t.Errorf("expected third SKU to be sku-unknown-777, got %s", toothbrush.SKU)
	}
	if toothbrush.Status != "unclassified" || toothbrush.CategoryID != "" || toothbrush.CategoryName != "" {
		t.Errorf("toothbrush classification mismatch: %+v", toothbrush)
	}
}

func TestClassifierCategorizationDirect(t *testing.T) {
	// Direct unit tests for ClassifyProductTitle
	catID, catName, score := ClassifyProductTitle("Organic Strawberry Yogurt")
	if catID != "category-dairy-eggs" || catName != "Dairy & Eggs" {
		t.Errorf("expected dairy-eggs classification, got: ID=%s, Name=%s (score=%f)", catID, catName, score)
	}

	catID, catName, score = ClassifyProductTitle("Brand New MacBook Laptop")
	if catID != "category-laptops" || catName != "Laptops" {
		t.Errorf("expected laptops classification, got: ID=%s, Name=%s (score=%f)", catID, catName, score)
	}

	catID, catName, score = ClassifyProductTitle("Yellow Bananas")
	if catID != "category-fruit-veg" || catName != "Fruits & Vegetables" {
		t.Errorf("expected fruit-veg classification, got: ID=%s, Name=%s (score=%f)", catID, catName, score)
	}

	catID, catName, _ = ClassifyProductTitle("Completely Random Objects")
	if catID != "" || catName != "" {
		t.Errorf("expected unclassified for random text, got: ID=%s, Name=%s", catID, catName)
	}
}

func TestRedisCacheFallbackAndGracefulBypass(t *testing.T) {
	// Ensure RedisClient is nil to test bypass mode
	oldClient := RedisClient
	RedisClient = nil
	defer func() {
		RedisClient = oldClient
	}()

	// 1. GetCachedCatalogItem should return nil, nil
	item, err := GetCachedCatalogItem("partner-123", "sku-abc")
	if err != nil {
		t.Errorf("GetCachedCatalogItem failed in bypass mode: %v", err)
	}
	if item != nil {
		t.Errorf("expected nil cached item, got %+v", item)
	}

	// 2. SetCachedCatalogItem should return nil (no crash)
	dummyItem := &CatalogItem{
		SKU: "sku-abc",
	}
	err = SetCachedCatalogItem("partner-123", "sku-abc", dummyItem)
	if err != nil {
		t.Errorf("SetCachedCatalogItem failed in bypass mode: %v", err)
	}

	// 3. InvalidateCachedCatalogItem should return nil (no crash)
	err = InvalidateCachedCatalogItem("partner-123", "sku-abc")
	if err != nil {
		t.Errorf("InvalidateCachedCatalogItem failed in bypass mode: %v", err)
	}
}

func TestRedisCacheInitialization(t *testing.T) {
	// 1. empty REDIS_URL
	InitCache("")
	if RedisClient != nil {
		t.Errorf("expected RedisClient to be nil on empty REDIS_URL, got %+v", RedisClient)
	}

	// 2. invalid REDIS_URL format
	InitCache("invalid-url-format")
	if RedisClient != nil {
		t.Errorf("expected RedisClient to be nil on invalid REDIS_URL format, got %+v", RedisClient)
	}
}

func TestClickHouseInitialization(t *testing.T) {
	// 1. empty CLICKHOUSE_URL DSN
	InitClickHouse("")
	if ClickHouseConn != nil {
		t.Errorf("expected ClickHouseConn to be nil on empty CLICKHOUSE_URL, got %+v", ClickHouseConn)
	}

	// 2. invalid DSN format
	InitClickHouse("invalid-url-format")
	if ClickHouseConn != nil {
		t.Errorf("expected ClickHouseConn to be nil on invalid DSN format, got %+v", ClickHouseConn)
	}
}

func TestClickHouseAsyncLoggingGracefulBypass(t *testing.T) {
	// Temporarily redirect connections and setup LogChan
	oldConn := ClickHouseConn
	ClickHouseConn = nil
	defer func() {
		ClickHouseConn = oldConn
	}()

	// Initialize log channel if not already done
	if LogChan == nil {
		LogChan = make(chan UsageLog, 100)
	}

	// Log a test event
	LogEvent(nil, "partner-123", "test_action", "sku-abc", "cat-xyz", 4.56, 1.23, 15)

	// Pull from the channel to verify correct field population
	select {
	case entry := <-LogChan:
		if entry.PartnerID != "partner-123" {
			t.Errorf("expected partner-123, got %s", entry.PartnerID)
		}
		if entry.ActionType != "test_action" {
			t.Errorf("expected test_action, got %s", entry.ActionType)
		}
		if entry.SKU != "sku-abc" {
			t.Errorf("expected sku-abc, got %s", entry.SKU)
		}
		if entry.CategoryID != "cat-xyz" {
			t.Errorf("expected cat-xyz, got %s", entry.CategoryID)
		}
		if entry.CO2eCalculated != 4.56 {
			t.Errorf("expected 4.56, got %f", entry.CO2eCalculated)
		}
		if entry.CO2eSaved != 1.23 {
			t.Errorf("expected 1.23, got %f", entry.CO2eSaved)
		}
		if entry.LatencyMs != 15 {
			t.Errorf("expected 15, got %d", entry.LatencyMs)
		}
		if entry.ClientIP != "127.0.0.1" {
			t.Errorf("expected 127.0.0.1, got %s", entry.ClientIP)
		}
		if entry.DeviceType != "web" {
			t.Errorf("expected web, got %s", entry.DeviceType)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for event on LogChan")
	}
}

