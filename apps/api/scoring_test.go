package main

import (
	"testing"
)

func TestInferCategoryFromTitle(t *testing.T) {
	tests := []struct {
		title    string
		expected string
	}{
		{"Organic Bananas 1 Bunch", "Fruits & Vegetables"},
		{"Almond Milk Unsweetened 1L", "Dairy & Eggs"},
		{"Fresh Premium Beef Steak", "Meat & Seafood"},
		{"Arabica Coffee Beans 250g", "Coffee & Tea"},
		{"Diet Coke Soda Can", "Soft Drinks"},
		{"Greenphone 15 Pro Max", "Smartphones"},
		{"Macbook Pro Laptop 16-inch", "Laptops"},
		{"Random Product Title", ""},
	}

	for _, test := range tests {
		result := inferCategoryFromTitle(test.title)
		if result != test.expected {
			t.Errorf("inferCategoryFromTitle(%q) = %q; want %q", test.title, result, test.expected)
		}
	}
}
