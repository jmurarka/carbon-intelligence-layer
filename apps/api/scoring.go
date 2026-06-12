package main

import (
	"fmt"
	"math"
	"strings"
)

// ResolveProductScore calculates the carbon footprint based on the estimation tree
func ResolveProductScore(partnerID string, sku string, weightGrams int, title string, categoryName string) (CarbonScoreResponse, error) {
	var co2ePerKg float64
	var confidence = "low"
	var calcMethod = "global_default_baseline"
	var categoryID string

	// Determine initial weight
	weightKg := float64(weightGrams) / 1000.0
	if weightKg <= 0 {
		weightKg = 1.0 // Default fallback weight (1 kg)
	}

	// 1. Check Exact SKU Override
	skuOverride, foundOverride, err := GetSKUOverride(partnerID, sku)
	if err == nil && foundOverride {
		co2ePerKg = skuOverride
		confidence = "high"
		calcMethod = "exact_sku_match"
	} else {
		// 2. Check Custom Product Catalog
		catalogItem, err := GetCatalogItem(partnerID, sku)
		if err == nil && catalogItem != nil {
			categoryID = catalogItem.CategoryID
			// If request didn't supply weight, use weight from catalog attributes
			if weightGrams <= 0 && catalogItem.WeightGrams > 0 {
				weightKg = float64(catalogItem.WeightGrams) / 1000.0
			}

			// Check category-level override
			catOverride, foundCatOverride, err := GetCategoryOverride(partnerID, categoryID)
			if err == nil && foundCatOverride {
				co2ePerKg = catOverride
				confidence = "high"
				calcMethod = "category_override"
			} else {
				// Query category factor
				factor, err := GetCategoryFactor(categoryID)
				if err == nil && factor != nil {
					co2ePerKg = factor.CO2ePerKg
					confidence = "high"
					calcMethod = "exact_sku_match"
				} else {
					// Check parent category fallback
					parentID, err := GetParentCategory(categoryID)
					if err == nil && parentID != "" {
						parentFactor, err := GetCategoryFactor(parentID)
						if err == nil && parentFactor != nil {
							co2ePerKg = parentFactor.CO2ePerKg
							confidence = "medium"
							calcMethod = "parent_category_fallback"
						}
					}
				}
			}
		}

		// 3. Check Category Name query param if no catalog item or factor found yet
		if co2ePerKg == 0 && categoryName != "" {
			catIDByName, err := GetCategoryByName(categoryName)
			if err == nil && catIDByName != "" {
				categoryID = catIDByName
				factor, err := GetCategoryFactor(categoryID)
				if err == nil && factor != nil {
					co2ePerKg = factor.CO2ePerKg
					confidence = "medium"
					calcMethod = "category_fallback"
				}
			}
		}

		// 4. Keyword Text Classification System (if title/sku matches known words)
		if co2ePerKg == 0 && title != "" {
			inferredCategory := inferCategoryFromTitle(title)
			if inferredCategory != "" {
				catIDByName, err := GetCategoryByName(inferredCategory)
				if err == nil && catIDByName != "" {
					categoryID = catIDByName
					factor, err := GetCategoryFactor(categoryID)
					if err == nil && factor != nil {
						co2ePerKg = factor.CO2ePerKg
						confidence = "low"
						calcMethod = "text_classification_fallback"
					}
				}
			}
		}

		// 5. Global Default Baseline
		if co2ePerKg == 0 {
			co2ePerKg = 1.5 // Standard baseline: 1.5 kg CO2e/kg
			confidence = "low"
			calcMethod = "global_default_baseline"
		}
	}

	co2eTotal := co2ePerKg * weightKg

	// Determine Tier
	tier := "medium"
	if co2eTotal < 1.0 {
		tier = "low"
	} else if co2eTotal >= 5.0 {
		tier = "high"
	}

	// Generate comparisons
	// 1 smartphone charge is approx 0.0082 kg CO2e
	phoneCharges := math.Round(co2eTotal / 0.0082)
	comparison := fmt.Sprintf("equivalent to charging %.0f smartphones", phoneCharges)

	// Breakdown
	breakdown := map[string]float64{
		"product_materials":  math.Round(co2eTotal*0.80*100) / 100,
		"packaging":          math.Round(co2eTotal*0.15*100) / 100,
		"transport_estimate": math.Round(co2eTotal*0.05*100) / 100,
	}

	return CarbonScoreResponse{
		SKU:                 sku,
		CO2eKg:              math.Round(co2eTotal*100) / 100,
		ConfidenceScore:     confidence,
		Tier:                tier,
		CalculationMethod:   calcMethod,
		ComparisonStatement: comparison,
		Breakdown:           breakdown,
		CategoryID:          categoryID,
	}, nil
}

// inferCategoryFromTitle maps product names to seed categories
func inferCategoryFromTitle(title string) string {
	t := strings.ToLower(title)
	if strings.Contains(t, "banana") || strings.Contains(t, "apple") || strings.Contains(t, "fruit") || strings.Contains(t, "veg") {
		return "Fruits & Vegetables"
	}
	if strings.Contains(t, "milk") || strings.Contains(t, "cheese") || strings.Contains(t, "dairy") || strings.Contains(t, "yogurt") || strings.Contains(t, "egg") {
		return "Dairy & Eggs"
	}
	if strings.Contains(t, "beef") || strings.Contains(t, "chicken") || strings.Contains(t, "steak") || strings.Contains(t, "pork") || strings.Contains(t, "meat") || strings.Contains(t, "fish") || strings.Contains(t, "seafood") {
		return "Meat & Seafood"
	}
	if strings.Contains(t, "coffee") || strings.Contains(t, "tea") {
		return "Coffee & Tea"
	}
	if strings.Contains(t, "soda") || strings.Contains(t, "coke") || strings.Contains(t, "drink") || strings.Contains(t, "juice") || strings.Contains(t, "beverage") {
		return "Soft Drinks"
	}
	if strings.Contains(t, "phone") || strings.Contains(t, "iphone") || strings.Contains(t, "smartphone") || strings.Contains(t, "pixel") {
		return "Smartphones"
	}
	if strings.Contains(t, "laptop") || strings.Contains(t, "macbook") || strings.Contains(t, "computer") {
		return "Laptops"
	}
	return ""
}
