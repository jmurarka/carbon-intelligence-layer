package main

import (
	"math"
)

// OffsetProject models metadata for carbon offset registries (e.g. Patch/Cloverly)
type OffsetProject struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Type                string `json:"type"`
	CostPerTonCents     int    `json:"cost_per_ton_cents"`
	CalculatedCostCents int    `json:"calculated_cost_cents"`
}

// CalculateOffsetsForGrandTotal computes cost options in cents for forestry, soil, and DAC projects.
func CalculateOffsetsForGrandTotal(co2eKg float64) ([]OffsetProject, error) {
	if co2eKg <= 0 {
		return []OffsetProject{}, nil
	}

	projects := []struct {
		ID              string
		Name            string
		Type            string
		CostPerTonCents int
	}{
		{
			ID:              "proj-reforest-pnw",
			Name:            "Reforestation in Pacific Northwest",
			Type:            "forestry",
			CostPerTonCents: 3500, // $35/ton
		},
		{
			ID:              "proj-soil-midwest",
			Name:            "Regenerative Agriculture Midwest Soil",
			Type:            "soil_sequestration",
			CostPerTonCents: 2000, // $20/ton
		},
		{
			ID:              "proj-dac-climeworks",
			Name:            "Direct Air Capture (Climeworks Iceland)",
			Type:            "direct_air_capture",
			CostPerTonCents: 15000, // $150/ton
		},
	}

	results := make([]OffsetProject, 0, len(projects))
	for _, p := range projects {
		// cost = co2e_kg * (cost_per_ton_cents / 1000 kg)
		cost := float64(p.CostPerTonCents) / 1000.0 * co2eKg
		costCents := int(math.Ceil(cost))

		// Apply minimum 5 cents processing floor
		if costCents < 5 {
			costCents = 5
		}

		results = append(results, OffsetProject{
			ID:                  p.ID,
			Name:                p.Name,
			Type:                p.Type,
			CostPerTonCents:     p.CostPerTonCents,
			CalculatedCostCents: costCents,
		})
	}

	return results, nil
}
