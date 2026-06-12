package main

import (
	"strings"
)

// In-memory categories backup (fallback when database is offline or in mock test mode)
var mockCategories = []struct {
	ID   string
	Name string
}{
	{"category-dairy-eggs", "Dairy & Eggs"},
	{"category-fruit-veg", "Fruits & Vegetables"},
	{"category-meat-seafood", "Meat & Seafood"},
	{"category-coffee-tea", "Coffee & Tea"},
	{"category-soft-drinks", "Soft Drinks"},
	{"category-smartphones", "Smartphones"},
	{"category-laptops", "Laptops"},
}

// Synonym mapping to boost category matches
var synonymDict = map[string]string{
	"milk":       "dairy & eggs",
	"cheese":     "dairy & eggs",
	"butter":     "dairy & eggs",
	"yogurt":     "dairy & eggs",
	"yoghurt":    "dairy & eggs",
	"egg":        "dairy & eggs",
	"eggs":       "dairy & eggs",
	"cream":      "dairy & eggs",
	"banana":     "fruits & vegetables",
	"bananas":    "fruits & vegetables",
	"apple":      "fruits & vegetables",
	"apples":     "fruits & vegetables",
	"strawberry": "fruits & vegetables",
	"strawberries": "fruits & vegetables",
	"berry":      "fruits & vegetables",
	"berries":    "fruits & vegetables",
	"vegetable":  "fruits & vegetables",
	"vegetables": "fruits & vegetables",
	"tomato":     "fruits & vegetables",
	"tomatoes":   "fruits & vegetables",
	"spinach":    "fruits & vegetables",
	"beef":       "meat & seafood",
	"steak":      "meat & seafood",
	"chicken":    "meat & seafood",
	"pork":       "meat & seafood",
	"salmon":     "meat & seafood",
	"tuna":       "meat & seafood",
	"fish":       "meat & seafood",
	"seafood":    "meat & seafood",
	"coffee":     "coffee & tea",
	"tea":        "coffee & tea",
	"espresso":   "coffee & tea",
	"latte":      "coffee & tea",
	"caffeine":   "coffee & tea",
	"soda":       "soft drinks",
	"cola":       "soft drinks",
	"coke":       "soft drinks",
	"juice":      "soft drinks",
	"lemonade":   "soft drinks",
	"beverage":   "soft drinks",
	"drink":      "soft drinks",
	"phone":      "smartphones",
	"iphone":     "smartphones",
	"smartphone": "smartphones",
	"pixel":      "smartphones",
	"galaxy":     "smartphones",
	"mobile":     "smartphones",
	"laptop":     "laptops",
	"macbook":    "laptops",
	"computer":   "laptops",
	"notebook":   "laptops",
}

type DbCategory struct {
	CategoryID string
	Name       string
}

// ClassifyProductTitle matches a product title to the best category ID in the database
func ClassifyProductTitle(title string) (string, string, float64) {
	var categories []DbCategory

	// Get categories from DB or mock
	if DB == nil {
		for _, mc := range mockCategories {
			categories = append(categories, DbCategory{CategoryID: mc.ID, Name: mc.Name})
		}
	} else {
		dbCats, err := GetAllCategories()
		if err == nil && len(dbCats) > 0 {
			categories = dbCats
		} else {
			// Fallback if query failed
			for _, mc := range mockCategories {
				categories = append(categories, DbCategory{CategoryID: mc.ID, Name: mc.Name})
			}
		}
	}

	bestCategoryID := ""
	bestCategoryName := ""
	highestScore := 0.0

	titleTokens := getCleanTokens(title)

	for _, cat := range categories {
		score := calculateMatchScore(titleTokens, cat.Name)
		if score > highestScore {
			highestScore = score
			bestCategoryID = cat.CategoryID
			bestCategoryName = cat.Name
		}
	}

	// Threshold for matching, otherwise returns empty
	if highestScore < 0.10 {
		return "", "", 0.0
	}

	return bestCategoryID, bestCategoryName, highestScore
}

// calculateMatchScore calculates Jaccard index similarity including synonym mapping
func calculateMatchScore(titleTokens []string, categoryName string) float64 {
	catTokens := getCleanTokens(categoryName)

	// Build token maps including synonym mappings
	titleMap := make(map[string]bool)
	for _, token := range titleTokens {
		titleMap[token] = true
		// Map synonym if exists
		if catMapped, ok := synonymDict[token]; ok {
			// Contextual check: Do not map "apple" to "fruits & vegetables" if it's an electronics product
			if token == "apple" {
				isElectronics := false
				for _, t := range titleTokens {
					if t == "macbook" || t == "laptop" || t == "computer" || t == "notebook" || t == "phone" || t == "iphone" || t == "smartphone" || t == "pixel" || t == "galaxy" || t == "mobile" {
						isElectronics = true
						break
					}
				}
				if isElectronics {
					continue
				}
			}
			// Also tokenise mapped synonyms (e.g. "fruits & vegetables" -> ["fruits", "vegetables"])
			for _, mappedToken := range getCleanTokens(catMapped) {
				titleMap[mappedToken] = true
			}
		}
	}

	catMap := make(map[string]bool)
	for _, token := range catTokens {
		catMap[token] = true
	}

	// Calculate Intersection
	intersectCount := 0
	for token := range catMap {
		if titleMap[token] {
			intersectCount++
		}
	}

	// Calculate Union
	unionMap := make(map[string]bool)
	for token := range titleMap {
		unionMap[token] = true
	}
	for token := range catMap {
		unionMap[token] = true
	}

	if len(unionMap) == 0 {
		return 0.0
	}

	return float64(intersectCount) / float64(len(unionMap))
}

// getCleanTokens splits string, lowercases, and strips punctuation
func getCleanTokens(input string) []string {
	cleaned := strings.ToLower(input)
	// Replace punctuation with spaces
	replacer := strings.NewReplacer(",", " ", ".", " ", "&", " ", "/", " ", "-", " ", "(", " ", ")", " ")
	cleaned = replacer.Replace(cleaned)

	rawTokens := strings.Fields(cleaned)
	var tokens []string
	for _, t := range rawTokens {
		// Filter out short stop words (e.g., "and", "or", "of", "the", "a")
		if t == "and" || t == "or" || t == "of" || t == "the" || t == "with" {
			continue
		}
		tokens = append(tokens, t)
	}
	return tokens
}
