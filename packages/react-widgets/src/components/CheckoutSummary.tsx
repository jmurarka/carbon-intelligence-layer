import React, { useState, useEffect } from 'react';

export interface CheckoutSummaryItem {
	productId: string;
	quantity: number;
	weightGrams?: number;
	title?: string;
	priceCents?: number;
}

export interface CheckoutSummaryProps {
	items: CheckoutSummaryItem[];
	logistics?: {
		transportMode: string;
		distanceKm: number;
	};
	apiKey: string;
	apiUrl?: string;
	onOffsetChecked?: (checked: boolean, project: any, costCents: number) => void;
	onSwapSuggestion?: (originalProductId: string, alternative: any) => void;
}

export const CheckoutSummary: React.FC<CheckoutSummaryProps> = ({
	items,
	logistics,
	apiKey,
	apiUrl = 'http://localhost:8081',
	onOffsetChecked,
	onSwapSuggestion
}) => {
	const [summary, setSummary] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [offsetSelected, setOffsetSelected] = useState(false);
	const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError(null);

		fetch(`${apiUrl}/checkout/summary`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ items, logistics })
		})
			.then(res => {
				if (!res.ok) {
					throw new Error(`Failed to calculate checkout summary: status ${res.status}`);
				}
				return res.json();
			})
			.then(data => {
				if (active) {
					setSummary(data);
					setLoading(false);
				}
			})
			.catch(err => {
				if (active) {
					setError(err.message);
					setLoading(false);
				}
			});

		return () => {
			active = false;
		};
	}, [items, logistics, apiKey, apiUrl]);

	// Trigger callback on offset state change
	const handleOffsetChange = (checked: boolean, projIndex: number) => {
		setOffsetSelected(checked);
		if (onOffsetChecked && summary && summary.offsetOptions.projects[projIndex]) {
			const project = summary.offsetOptions.projects[projIndex];
			onOffsetChecked(checked, project, project.calculatedCostCents);
		}
	};

	if (loading) {
		return (
			<div style={styles.cardLoading}>
				<span style={styles.spinner}></span> Calculating carbon footprint and offsets...
			</div>
		);
	}

	if (error || !summary) {
		return (
			<div style={styles.cardError}>
				⚠️ Could not resolve order carbon estimates.
			</div>
		);
	}

	const activeProject = summary.offsetOptions.projects[selectedProjectIndex] || summary.offsetOptions.projects[0];
	const offsetCost = activeProject ? (activeProject.calculatedCostCents / 100).toFixed(2) : '0.00';

	return (
		<div style={styles.card}>
			<div style={styles.header}>
				<span style={styles.leafBadge}>🍃</span>
				<div>
					<h3 style={styles.title}>Green Checkout summary</h3>
					<span style={styles.subtitle}>Powered by Carbon Companion</span>
				</div>
			</div>

			<div style={styles.grid}>
				<div style={styles.gridCol}>
					<span style={styles.metricLabel}>Product footprint</span>
					<span style={styles.metricVal}>{summary.orderTotalCo2eKg} kg CO₂e</span>
				</div>
				<div style={styles.gridCol}>
					<span style={styles.metricLabel}>Logistics / Delivery</span>
					<span style={styles.metricVal}>{summary.logisticsCo2eKg} kg CO₂e</span>
				</div>
				<div style={styles.gridColFull}>
					<span style={styles.metricLabel}>Total carbon impact</span>
					<span style={styles.grandTotalVal}>{summary.grandTotalCo2eKg} kg CO₂e</span>
				</div>
			</div>

			{/* Comparisons */}
			<div style={styles.comparisonsCard}>
				<div style={styles.comparisonRow}>
					<span style={styles.emoji}>🚗</span>
					<span>Equivalent to driving <strong>{summary.comparisons.milesDriven}</strong> miles in an ICE car</span>
				</div>
				<div style={styles.comparisonRow}>
					<span style={styles.emoji}>🌲</span>
					<span>Requires <strong>{summary.comparisons.treeDaysAbsorbed}</strong> tree-days of forest absorption to neutralize</span>
				</div>
			</div>

			{/* Alternative swap suggestion if present */}
			{summary.alternativeSuggestion && (
				<div style={styles.suggestionCard}>
					<div style={styles.suggestionHeader}>
						<span style={styles.badgeSparkle}>💡 Carbon Reduction Suggestion</span>
					</div>
					<div style={styles.suggestionBody}>
						Swap your selection of milk or beef for <strong>{summary.alternativeSuggestion.title}</strong> to save{' '}
						<span style={styles.highlightText}>{summary.alternativeSuggestion.co2eSavedKg} kg CO₂e</span>!
						<div style={styles.reasonText}>
							{summary.alternativeSuggestion.reasoning}
						</div>
						<button
							style={styles.swapBtn}
							onClick={() => {
								if (onSwapSuggestion) {
									// Search items to identify which product is being swapped out
									const originalItem = items.find(i => i.productId.includes('almond') || i.productId.includes('beef'));
									onSwapSuggestion(originalItem ? originalItem.productId : '', summary.alternativeSuggestion);
								}
							}}
						>
							Apply Swap Selection
						</button>
					</div>
				</div>
			)}

			{/* Carbon Offset Selection */}
			{summary.offsetOptions.projects && summary.offsetOptions.projects.length > 0 && (
				<div style={{ ...styles.offsetSection, borderColor: offsetSelected ? '#2ed573' : 'rgba(255, 255, 255, 0.1)' }}>
					<div style={styles.offsetHeader}>
						<label style={styles.checkboxContainer}>
							<input
								type="checkbox"
								checked={offsetSelected}
								onChange={(e) => handleOffsetChange(e.target.checked, selectedProjectIndex)}
								style={styles.checkbox}
							/>
							<span style={styles.checkboxLabel}>Make my order 100% Carbon Neutral</span>
						</label>
						<span style={{ ...styles.offsetCost, color: offsetSelected ? '#2ed573' : '#ffffff' }}>
							+ ${offsetCost}
						</span>
					</div>

					<div style={styles.projectSelectContainer}>
						<label style={styles.selectLabel}>Select Offset Registry Project:</label>
						<select
							style={styles.select}
							value={selectedProjectIndex}
							onChange={(e) => {
								const val = parseInt(e.target.value, 10);
								setSelectedProjectIndex(val);
								if (offsetSelected) {
									handleOffsetChange(true, val);
								}
							}}
						>
							{summary.offsetOptions.projects.map((proj: any, idx: number) => (
								<option key={proj.id} value={idx}>
									{proj.name} (${(proj.calculatedCostCents / 100).toFixed(2)})
								</option>
							))}
						</select>
					</div>
				</div>
			)}
		</div>
	);
};

const styles: Record<string, React.CSSProperties> = {
	card: {
		padding: '24px',
		borderRadius: '16px',
		backgroundColor: 'rgba(18, 18, 22, 0.85)',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		backdropFilter: 'blur(16px)',
		WebkitBackdropFilter: 'blur(16px)',
		boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
		fontFamily: '"Outfit", "Inter", sans-serif',
		color: '#ffffff',
		maxWidth: '480px',
		margin: '0 auto'
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		marginBottom: '20px'
	},
	leafBadge: {
		fontSize: '24px',
		padding: '8px',
		borderRadius: '50%',
		backgroundColor: 'rgba(46, 213, 115, 0.12)',
		marginRight: '12px'
	},
	title: {
		margin: 0,
		fontSize: '18px',
		fontWeight: 700,
		color: '#f8fafc'
	},
	subtitle: {
		fontSize: '11px',
		color: '#64748b',
		textTransform: 'uppercase',
		letterSpacing: '1px'
	},
	grid: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: '12px',
		marginBottom: '16px'
	},
	gridCol: {
		backgroundColor: 'rgba(255, 255, 255, 0.03)',
		padding: '12px',
		borderRadius: '8px',
		border: '1px solid rgba(255, 255, 255, 0.05)',
		display: 'flex',
		flexDirection: 'column'
	},
	gridColFull: {
		gridColumn: 'span 2',
		backgroundColor: 'rgba(46, 213, 115, 0.05)',
		padding: '14px',
		borderRadius: '8px',
		border: '1px solid rgba(46, 213, 115, 0.2)',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center'
	},
	metricLabel: {
		fontSize: '11px',
		color: '#94a3b8',
		marginBottom: '4px',
		textTransform: 'uppercase',
		letterSpacing: '0.5px'
	},
	metricVal: {
		fontSize: '16px',
		fontWeight: 600,
		color: '#e2e8f0'
	},
	grandTotalVal: {
		fontSize: '22px',
		fontWeight: 700,
		color: '#2ed573'
	},
	comparisonsCard: {
		backgroundColor: 'rgba(255, 255, 255, 0.02)',
		padding: '12px 16px',
		borderRadius: '8px',
		border: '1px solid rgba(255, 255, 255, 0.04)',
		marginBottom: '16px',
		display: 'flex',
		flexDirection: 'column',
		gap: '8px'
	},
	comparisonRow: {
		display: 'flex',
		alignItems: 'center',
		fontSize: '12px',
		color: '#cbd5e1',
		lineHeight: '1.4'
	},
	emoji: {
		fontSize: '16px',
		marginRight: '10px'
	},
	suggestionCard: {
		backgroundColor: 'rgba(59, 130, 246, 0.06)',
		border: '1px solid rgba(59, 130, 246, 0.25)',
		borderRadius: '10px',
		padding: '14px',
		marginBottom: '16px'
	},
	suggestionHeader: {
		fontSize: '12px',
		fontWeight: 700,
		color: '#3b82f6',
		marginBottom: '6px'
	},
	suggestionBody: {
		fontSize: '12px',
		color: '#e2e8f0',
		lineHeight: '1.5'
	},
	highlightText: {
		color: '#3b82f6',
		fontWeight: 700
	},
	reasonText: {
		fontSize: '11px',
		color: '#94a3b8',
		marginTop: '4px',
		fontStyle: 'italic'
	},
	swapBtn: {
		marginTop: '10px',
		width: '100%',
		padding: '8px',
		backgroundColor: '#3b82f6',
		color: '#ffffff',
		border: 'none',
		borderRadius: '6px',
		fontWeight: 600,
		fontSize: '12px',
		cursor: 'pointer',
		transition: 'background-color 0.2s ease'
	},
	offsetSection: {
		backgroundColor: 'rgba(255, 255, 255, 0.02)',
		border: '1px solid rgba(255, 255, 255, 0.08)',
		borderRadius: '10px',
		padding: '14px',
		transition: 'border-color 0.3s ease'
	},
	offsetHeader: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '12px'
	},
	checkboxContainer: {
		display: 'flex',
		alignItems: 'center',
		cursor: 'pointer'
	},
	checkbox: {
		width: '16px',
		height: '16px',
		marginRight: '8px',
		accentColor: '#2ed573'
	},
	checkboxLabel: {
		fontSize: '12px',
		fontWeight: 600,
		color: '#f1f5f9'
	},
	offsetCost: {
		fontSize: '14px',
		fontWeight: 700,
		transition: 'color 0.3s ease'
	},
	projectSelectContainer: {
		display: 'flex',
		flexDirection: 'column',
		gap: '4px'
	},
	selectLabel: {
		fontSize: '10px',
		color: '#64748b',
		textTransform: 'uppercase',
		letterSpacing: '0.5px'
	},
	select: {
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		borderRadius: '6px',
		padding: '8px',
		color: '#ffffff',
		fontSize: '12px',
		outline: 'none',
		cursor: 'pointer'
	},
	cardLoading: {
		padding: '30px',
		backgroundColor: 'rgba(18, 18, 22, 0.85)',
		borderRadius: '16px',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		color: '#a0a0a0',
		fontSize: '14px',
		textAlign: 'center',
		fontFamily: '"Outfit", "Inter", sans-serif',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '10px'
	},
	cardError: {
		padding: '24px',
		backgroundColor: 'rgba(255, 71, 87, 0.08)',
		border: '1px solid rgba(255, 71, 87, 0.25)',
		borderRadius: '16px',
		color: '#ff4757',
		fontSize: '14px',
		textAlign: 'center',
		fontWeight: 600,
		fontFamily: '"Outfit", "Inter", sans-serif'
	},
	spinner: {
		width: '16px',
		height: '16px',
		border: '2px solid rgba(160, 160, 160, 0.2)',
		borderTop: '2px solid #2ed573',
		borderRadius: '50%',
		animation: 'spin 1s linear infinite'
	}
};
