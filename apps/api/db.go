package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"

	_ "github.com/lib/pq"
)

var DB *sql.DB

// InitDB initializes the database connection pool
func InitDB(connStr string) error {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("error opening database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return fmt.Errorf("error connecting to database: %w", err)
	}

	DB = db
	return nil
}

// GetPartnerIDByToken hashes the bearer token and checks if it is active in partner_keys
func GetPartnerIDByToken(token string) (string, error) {
	if DB == nil {
		if token == "cc_live_testkey123" {
			return "a0f7c222-38b8-4d57-814d-61c02b11ea99", nil
		}
		return "", errors.New("invalid or revoked API key")
	}

	// SHA-256 hash token
	hasher := sha256.New()
	hasher.Write([]byte(token))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

	var partnerID string
	err := DB.QueryRow(
		`SELECT partner_id FROM partner_keys WHERE hashed_key = $1 AND status = 'active'`,
		hashedKey,
	).Scan(&partnerID)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("invalid or revoked API key")
		}
		return "", fmt.Errorf("db error checking API key: %w", err)
	}

	return partnerID, nil
}

type CatalogItem struct {
	CatalogItemID string
	PartnerID     string
	SKU           string
	GTIN          *string
	Title         string
	CategoryID    string
	WeightGrams   int
}

// GetCatalogItem queries the custom product catalog for a partner and SKU
func GetCatalogItem(partnerID string, sku string) (*CatalogItem, error) {
	// 1. Try checking cache first
	cachedItem, err := GetCachedCatalogItem(partnerID, sku)
	if err == nil && cachedItem != nil {
		return cachedItem, nil
	}

	// 2. Fallback to Database/Mock if cache miss
	var item *CatalogItem
	if DB == nil {
		gtin := "000000000002"
		if sku == "sku-almondmilk-002" {
			item = &CatalogItem{
				CatalogItemID: "item-1",
				PartnerID:     partnerID,
				SKU:           sku,
				GTIN:          &gtin,
				Title:         "Almond Milk 1L",
				CategoryID:    "category-dairy-eggs",
				WeightGrams:   1000,
			}
		} else if sku == "sku-beefsteak-003" {
			gtinBeef := "000000000003"
			item = &CatalogItem{
				CatalogItemID: "item-2",
				PartnerID:     partnerID,
				SKU:           sku,
				GTIN:          &gtinBeef,
				Title:         "Premium Beef Steak",
				CategoryID:    "category-meat-seafood",
				WeightGrams:   400,
			}
		}
	} else {
		var dbItem CatalogItem
		var weightStr sql.NullString

		err := DB.QueryRow(
			`SELECT catalog_item_id, partner_id, sku, gtin, title, category_id, attributes->>'weight_grams'
			 FROM product_catalog
			 WHERE partner_id = $1 AND sku = $2`,
			partnerID, sku,
		).Scan(&dbItem.CatalogItemID, &dbItem.PartnerID, &dbItem.SKU, &dbItem.GTIN, &dbItem.Title, &dbItem.CategoryID, &weightStr)

		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, nil // Not found, graceful
			}
			return nil, err
		}

		if weightStr.Valid {
			if w, err := strconv.Atoi(weightStr.String); err == nil {
				dbItem.WeightGrams = w
			}
		}
		item = &dbItem
	}

	// 3. Populate Cache on successful fetch
	if item != nil {
		_ = SetCachedCatalogItem(partnerID, sku, item)
	}

	return item, nil
}

// GetSKUOverride checks if there is a custom factor override for a SKU
func GetSKUOverride(partnerID string, sku string) (float64, bool, error) {
	if DB == nil {
		if sku == "sku-bananas-001" {
			return 0.35, true, nil
		}
		return 0, false, nil
	}

	var customFactor float64
	err := DB.QueryRow(
		`SELECT custom_factor FROM partner_overrides
		 WHERE partner_id = $1 AND sku = $2`,
		partnerID, sku,
	).Scan(&customFactor)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}

	return customFactor, true, nil
}

// GetCategoryOverride checks if there is a custom factor override for all products in a category
func GetCategoryOverride(partnerID string, categoryID string) (float64, bool, error) {
	if DB == nil {
		return 0, false, nil
	}

	var customFactor float64
	err := DB.QueryRow(
		`SELECT custom_factor FROM partner_overrides
		 WHERE partner_id = $1 AND category_id = $2 AND sku IS NULL`,
		partnerID, categoryID,
	).Scan(&customFactor)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}

	return customFactor, true, nil
}

type EmissionFactorData struct {
	FactorID      string
	SourceDataset string
	SourceCode    string
	CO2ePerKg     float64
}

// GetCategoryFactor gets the active emission factor for a category
func GetCategoryFactor(categoryID string) (*EmissionFactorData, error) {
	if DB == nil {
		if categoryID == "category-dairy-eggs" {
			return &EmissionFactorData{
				FactorID:      "factor-1",
				SourceDataset: "agribalyse",
				SourceCode:    "AGRI_DAIRY",
				CO2ePerKg:     2.50,
			}, nil
		}
		if categoryID == "category-meat-seafood" {
			return &EmissionFactorData{
				FactorID:      "factor-2",
				SourceDataset: "agribalyse",
				SourceCode:    "AGRI_MEAT",
				CO2ePerKg:     12.00,
			}, nil
		}
		return nil, nil
	}

	var f EmissionFactorData
	err := DB.QueryRow(
		`SELECT factor_id, source_dataset, source_code, co2e_per_kg
		 FROM emission_factors
		 WHERE category_id = $1 AND valid_from <= NOW() AND (valid_to IS NULL OR valid_to >= NOW())
		 LIMIT 1`,
		categoryID,
	).Scan(&f.FactorID, &f.SourceDataset, &f.SourceCode, &f.CO2ePerKg)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &f, nil
}

// GetCategoryByName looks up category_id by its case-insensitive name
func GetCategoryByName(name string) (string, error) {
	if DB == nil {
		if name == "Dairy & Eggs" || name == "dairy-category-id" {
			return "category-dairy-eggs", nil
		}
		return "", nil
	}

	var categoryID string
	err := DB.QueryRow(
		`SELECT category_id FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1`,
		name,
	).Scan(&categoryID)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	return categoryID, nil
}

// GetParentCategory retrieves parent category ID if exists
func GetParentCategory(categoryID string) (string, error) {
	if DB == nil {
		return "", nil
	}

	var parentID sql.NullString
	err := DB.QueryRow(
		`SELECT parent_id FROM categories WHERE category_id = $1`,
		categoryID,
	).Scan(&parentID)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	if parentID.Valid {
		return parentID.String, nil
	}
	return "", nil
}

type DbTransportFactor struct {
	TransportID        string
	ModeName           string
	CO2ePerKmPassenger float64
	CO2ePerKmTon       float64
	SourceDataset      string
}

// GetTransportFactor queries emission factors for a logistics transport mode
func GetTransportFactor(modeName string) (*DbTransportFactor, error) {
	if DB == nil {
		if modeName == "diesel_van" {
			return &DbTransportFactor{
				TransportID:        "tf-1",
				ModeName:           "diesel_van",
				CO2ePerKmPassenger: 0.00,
				CO2ePerKmTon:       0.25,
				SourceDataset:      "defra",
			}, nil
		}
		return nil, nil
	}

	var tf DbTransportFactor
	err := DB.QueryRow(
		`SELECT transport_id, mode_name, co2e_per_km_passenger, co2e_per_km_ton, source_dataset
		 FROM transport_factors
		 WHERE mode_name = $1 LIMIT 1`,
		modeName,
	).Scan(&tf.TransportID, &tf.ModeName, &tf.CO2ePerKmPassenger, &tf.CO2ePerKmTon, &tf.SourceDataset)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &tf, nil
}

type SuggestionItem struct {
	SKU         string
	Title       string
	CategoryID  string
	WeightGrams int
}

// GetSuggestionsForCategory looks up other products in the same category for alternative recommendations
func GetSuggestionsForCategory(partnerID string, categoryID string, currentSKU string, limit int) ([]SuggestionItem, error) {
	if DB == nil {
		if currentSKU == "sku-almondmilk-002" {
			return []SuggestionItem{
				{
					SKU:         "sku-oatmilk-local",
					Title:       "Oat Milk 1L (Local)",
					CategoryID:    categoryID,
					WeightGrams:   1000,
				},
			}, nil
		}
		return nil, nil
	}

	rows, err := DB.Query(
		`SELECT sku, title, category_id, attributes->>'weight_grams'
		 FROM product_catalog
		 WHERE partner_id = $1 AND category_id = $2 AND sku != $3
		 LIMIT $4`,
		partnerID, categoryID, currentSKU, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []SuggestionItem
	for rows.Next() {
		var item SuggestionItem
		var weightStr sql.NullString
		if err := rows.Scan(&item.SKU, &item.Title, &item.CategoryID, &weightStr); err != nil {
			return nil, err
		}
		if weightStr.Valid {
			if w, err := strconv.Atoi(weightStr.String); err == nil {
				item.WeightGrams = w
			}
		}
		suggestions = append(suggestions, item)
	}

	return suggestions, nil
}

// GetAllCategories retrieves all standard categories from the database
func GetAllCategories() ([]DbCategory, error) {
	if DB == nil {
		return nil, nil
	}

	rows, err := DB.Query(`SELECT category_id, name FROM categories`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []DbCategory
	for rows.Next() {
		var cat DbCategory
		if err := rows.Scan(&cat.CategoryID, &cat.Name); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}

	return categories, nil
}

// SaveCatalogItem inserts or updates a product catalog item in PostgreSQL
func SaveCatalogItem(partnerID string, sku string, gtin string, title string, categoryID string) error {
	// Evict from cache on save to prevent stale reads
	defer func() {
		_ = InvalidateCachedCatalogItem(partnerID, sku)
	}()

	if DB == nil {
		return nil // Success in mock mode
	}

	var gtinVal interface{} = gtin
	if gtin == "" {
		gtinVal = nil
	}

	_, err := DB.Exec(
		`INSERT INTO product_catalog (catalog_item_id, partner_id, sku, gtin, title, category_id, created_at, updated_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
		 ON CONFLICT (partner_id, sku) 
		 DO UPDATE SET gtin = EXCLUDED.gtin, title = EXCLUDED.title, category_id = EXCLUDED.category_id, updated_at = NOW()`,
		partnerID, sku, gtinVal, title, categoryID,
	)

	return err
}

