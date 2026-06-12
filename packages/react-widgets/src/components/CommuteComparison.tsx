import React, { useState, useEffect } from 'react';

export interface CommuteOption {
	mode: string;
	durationMinutes: number;
	costCents: number;
	co2eKg: number;
	tier: 'Low' | 'Medium' | 'High';
}

export interface CommuteComparisonProps {
	distanceKm: number;
	apiKey: string;
	apiUrl?: string;
}

export const CommuteComparison: React.FC<CommuteComparisonProps> = ({
	distanceKm,
	apiKey,
	apiUrl = 'http://localhost:8081'
}) => {
	const [options, setOptions] = useState<CommuteOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sortBy, setSortBy] = useState<'co2eKg' | 'durationMinutes' | 'costCents'>('co2eKg');

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError(null);

		fetch(`${apiUrl}/commute/options?distance_km=${distanceKm}`, {
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})
			.then(res => {
				if (!res.ok) {
					throw new Error(`Failed to load commute options: status ${res.status}`);
				}
				return res.json();
			})
			.then(data => {
				if (active) {
					setOptions(data);
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
	}, [distanceKm, apiKey, apiUrl]);

	const getModeLabelAndEmoji = (mode: string) => {
		switch (mode) {
			case 'diesel_van':
				return { label: 'Diesel Delivery Van', emoji: '🚚' };
			case 'ev_car':
				return { label: 'Electric Vehicle (EV)', emoji: '⚡🚗' };
			case 'public_transit':
				return { label: 'Public Transit (Bus/Train)', emoji: '🚊' };
			case 'bicycle':
				return { label: 'Active Transit (Bicycle/Walk)', emoji: '🚲' };
			default:
				return { label: mode, emoji: '🚶' };
		}
	};

	const getTierBadgeStyle = (tier: 'Low' | 'Medium' | 'High') => {
		switch (tier) {
			case 'Low':
				return { bg: 'rgba(46, 213, 115, 0.15)', text: '#2ed573', border: 'rgba(46, 213, 115, 0.3)' };
			case 'Medium':
				return { bg: 'rgba(255, 165, 0, 0.15)', text: '#ffa500', border: 'rgba(255, 165, 0, 0.3)' };
			case 'High':
				return { bg: 'rgba(255, 71, 87, 0.15)', text: '#ff4757', border: 'rgba(255, 71, 87, 0.3)' };
		}
	};

	const sortedOptions = [...options].sort((a, b) => {
		return a[sortBy] - b[sortBy];
	});

	if (loading) {
		return (
			<div style={styles.cardLoading}>
				<span style={styles.spinner}></span> Analyzing local delivery routes and modes...
			</div>
		);
	}

	if (error || options.length === 0) {
		return (
			<div style={styles.cardError}>
				⚠️ Could not compare logistics commute options.
			</div>
		);
	}

	// Find the minimum carbon footprint option to highlight as "Eco Choice"
	const greenestOption = options.reduce((min, op) => op.co2eKg < min.co2eKg ? op : min, options[0]);

	return (
		<div style={styles.card}>
			<div style={styles.header}>
				<span style={styles.icon}>⏱️</span>
				<div>
					<h3 style={styles.title}>Commute & Delivery comparison</h3>
					<span style={styles.subtitle}>Logistics Options for {distanceKm} km route</span>
				</div>
			</div>

			{/* Sorting Tabs */}
			<div style={styles.tabContainer}>
				<span style={styles.sortLabel}>Sort by:</span>
				<button
					style={{ ...styles.tabBtn, ...(sortBy === 'co2eKg' ? styles.tabBtnActive : {}) }}
					onClick={() => setSortBy('co2eKg')}
				>
					Carbon
				</button>
				<button
					style={{ ...styles.tabBtn, ...(sortBy === 'durationMinutes' ? styles.tabBtnActive : {}) }}
					onClick={() => setSortBy('durationMinutes')}
				>
					Time
				</button>
				<button
					style={{ ...styles.tabBtn, ...(sortBy === 'costCents' ? styles.tabBtnActive : {}) }}
					onClick={() => setSortBy('costCents')}
				>
					Cost
				</button>
			</div>

			{/* List comparison grid */}
			<div style={styles.listContainer}>
				{sortedOptions.map((opt) => {
					const { label, emoji } = getModeLabelAndEmoji(opt.mode);
					const isGreenest = opt.mode === greenestOption.mode;
					const badge = getTierBadgeStyle(opt.tier);

					return (
						<div
							key={opt.mode}
							style={{
								...styles.itemRow,
								borderColor: isGreenest ? '#2ed573' : 'rgba(255, 255, 255, 0.08)',
								backgroundColor: isGreenest ? 'rgba(46, 213, 115, 0.03)' : 'rgba(255, 255, 255, 0.01)'
							}}
						>
							{isGreenest && (
								<div style={styles.greenestBanner}>
									🌟 GREENEST SELECTION
								</div>
							)}

							<div style={styles.rowHeader}>
								<span style={styles.modeEmoji}>{emoji}</span>
								<span style={styles.modeLabel}>{label}</span>
							</div>

							<div style={styles.statsGrid}>
								<div style={styles.statCell}>
									<span style={styles.statLabel}>Est. Duration</span>
									<span style={styles.statVal}>{opt.durationMinutes} mins</span>
								</div>

								<div style={styles.statCell}>
									<span style={styles.statLabel}>Travel Cost</span>
									<span style={styles.statVal}>
										{opt.costCents === 0 ? 'Free' : `$${(opt.costCents / 100).toFixed(2)}`}
									</span>
								</div>

								<div style={styles.statCell}>
									<span style={styles.statLabel}>Carbon Impact</span>
									<span
										style={{
											...styles.tierBadge,
											backgroundColor: badge.bg,
											color: badge.text,
											borderColor: badge.border
										}}
									>
										{opt.co2eKg} kg CO₂e
									</span>
								</div>
							</div>
						</div>
					);
				})}
			</div>
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
		maxWidth: '520px',
		margin: '0 auto'
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		marginBottom: '20px'
	},
	icon: {
		fontSize: '24px',
		padding: '8px',
		borderRadius: '50%',
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
	tabContainer: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		marginBottom: '16px',
		backgroundColor: 'rgba(0, 0, 0, 0.2)',
		padding: '4px',
		borderRadius: '8px',
		width: 'fit-content'
	},
	sortLabel: {
		fontSize: '11px',
		color: '#64748b',
		marginLeft: '8px',
		fontWeight: 500
	},
	tabBtn: {
		padding: '6px 12px',
		borderRadius: '6px',
		border: 'none',
		backgroundColor: 'transparent',
		color: '#94a3b8',
		fontSize: '12px',
		fontWeight: 600,
		cursor: 'pointer',
		transition: 'all 0.2s ease'
	},
	tabBtnActive: {
		backgroundColor: 'rgba(255, 255, 255, 0.08)',
		color: '#ffffff'
	},
	listContainer: {
		display: 'flex',
		flexDirection: 'column',
		gap: '14px'
	},
	itemRow: {
		border: '1px solid transparent',
		borderRadius: '12px',
		padding: '16px',
		position: 'relative',
		transition: 'all 0.2s ease',
		display: 'flex',
		flexDirection: 'column',
		gap: '10px'
	},
	greenestBanner: {
		position: 'absolute',
		top: '-10px',
		right: '12px',
		backgroundColor: '#2ed573',
		color: '#121216',
		fontSize: '9px',
		fontWeight: 800,
		padding: '2px 8px',
		borderRadius: '4px',
		letterSpacing: '0.5px'
	},
	rowHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px'
	},
	modeEmoji: {
		fontSize: '18px'
	},
	modeLabel: {
		fontWeight: 700,
		fontSize: '14px',
		color: '#f1f5f9'
	},
	statsGrid: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr 1.2fr',
		gap: '8px'
	},
	statCell: {
		display: 'flex',
		flexDirection: 'column',
		gap: '2px'
	},
	statLabel: {
		fontSize: '10px',
		color: '#64748b',
		textTransform: 'uppercase'
	},
	statVal: {
		fontSize: '13px',
		fontWeight: 600,
		color: '#cbd5e1'
	},
	tierBadge: {
		display: 'inline-block',
		padding: '3px 8px',
		borderRadius: '6px',
		fontSize: '11px',
		fontWeight: 700,
		border: '1px solid transparent',
		width: 'fit-content',
		textAlign: 'center'
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
