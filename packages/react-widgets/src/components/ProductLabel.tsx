import React, { useState, useEffect } from 'react';

export interface ProductLabelProps {
	productId: string;
	apiKey: string;
	apiUrl?: string;
	initialScore?: {
		co2eKg: number;
		tier: 'Low' | 'Medium' | 'High';
		confidenceScore: 'low' | 'medium' | 'high';
		comparisonStatement: string;
		breakdown: {
			productMaterials: number;
			packaging: number;
			transportEstimate: number;
		};
	};
}

export const ProductLabel: React.FC<ProductLabelProps> = ({
	productId,
	apiKey,
	apiUrl = 'http://localhost:8081',
	initialScore
}) => {
	const [score, setScore] = useState(initialScore);
	const [loading, setLoading] = useState(!initialScore);
	const [error, setError] = useState<string | null>(null);
	const [hovered, setHovered] = useState(false);

	useEffect(() => {
		if (initialScore) {
			setScore(initialScore);
			setLoading(false);
			return;
		}

		let active = true;
		setLoading(true);
		setError(null);

		fetch(`${apiUrl}/carbon-score/${productId}`, {
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})
			.then(res => {
				if (!res.ok) {
					throw new Error(`Failed to load carbon score: status ${res.status}`);
				}
				return res.json();
			})
			.then(data => {
				if (active) {
					setScore(data);
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
	}, [productId, apiKey, apiUrl, initialScore]);

	if (loading) {
		return (
			<span style={styles.loadingBadge}>
				<span style={styles.spinner}></span> Calculating Impact...
			</span>
		);
	}

	if (error || !score) {
		return (
			<span style={styles.errorBadge} title={error || 'Score unavailable'}>
				🍃 Carbon Impact Unknown
			</span>
		);
	}

	const getColors = (tier: 'Low' | 'Medium' | 'High') => {
		switch (tier) {
			case 'Low':
				return {
					bg: 'rgba(46, 213, 115, 0.15)',
					border: 'rgba(46, 213, 115, 0.35)',
					text: '#2ed573',
					accent: '#2ed573'
				};
			case 'Medium':
				return {
					bg: 'rgba(255, 165, 0, 0.15)',
					border: 'rgba(255, 165, 0, 0.35)',
					text: '#ffa500',
					accent: '#ffa500'
				};
			case 'High':
				return {
					bg: 'rgba(255, 71, 87, 0.15)',
					border: 'rgba(255, 71, 87, 0.35)',
					text: '#ff4757',
					accent: '#ff4757'
				};
		}
	};

	const colors = getColors(score.tier);

	const badgeStyle = {
		...styles.badge,
		backgroundColor: colors.bg,
		borderColor: colors.border,
		color: colors.text
	};

	return (
		<div
			style={styles.container}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<span style={badgeStyle}>
				<span style={{ ...styles.dot, backgroundColor: colors.accent }}></span>
				{score.co2eKg} kg CO₂e • {score.tier}
			</span>

			{hovered && (
				<div style={styles.tooltip}>
					<h4 style={styles.tooltipTitle}>Lifecycle Carbon Breakdown</h4>
					<div style={styles.divider}></div>
					<div style={styles.statRow}>
						<span>Product Materials</span>
						<strong>{score.breakdown.productMaterials} kg</strong>
					</div>
					<div style={styles.statRow}>
						<span>Packaging</span>
						<strong>{score.breakdown.packaging} kg</strong>
					</div>
					<div style={styles.statRow}>
						<span>Transport (est.)</span>
						<strong>{score.breakdown.transportEstimate} kg</strong>
					</div>
					<div style={styles.divider}></div>
					<div style={styles.comparison}>
						<span style={styles.leafIcon}>🍃</span> {score.comparisonStatement}
					</div>
					<div style={{ ...styles.confidenceBadge, border: `1px solid ${colors.border}` }}>
						Confidence: {score.confidenceScore.toUpperCase()}
					</div>
				</div>
			)}
		</div>
	);
};

const styles: Record<string, React.CSSProperties> = {
	container: {
		display: 'inline-block',
		position: 'relative',
		fontFamily: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		cursor: 'pointer',
		userSelect: 'none'
	},
	badge: {
		display: 'inline-flex',
		alignItems: 'center',
		padding: '6px 12px',
		borderRadius: '20px',
		fontSize: '13px',
		fontWeight: 600,
		border: '1px solid transparent',
		backdropFilter: 'blur(8px)',
		WebkitBackdropFilter: 'blur(8px)',
		transition: 'transform 0.2s ease, box-shadow 0.2s ease'
	},
	dot: {
		width: '8px',
		height: '8px',
		borderRadius: '50%',
		marginRight: '8px',
		boxShadow: '0 0 8px currentColor'
	},
	loadingBadge: {
		display: 'inline-flex',
		alignItems: 'center',
		padding: '6px 12px',
		borderRadius: '20px',
		fontSize: '13px',
		fontWeight: 500,
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		color: '#a0a0a0',
		fontFamily: '"Outfit", "Inter", sans-serif'
	},
	errorBadge: {
		display: 'inline-flex',
		alignItems: 'center',
		padding: '6px 12px',
		borderRadius: '20px',
		fontSize: '13px',
		fontWeight: 500,
		backgroundColor: 'rgba(255, 255, 255, 0.02)',
		border: '1px solid rgba(255, 255, 255, 0.08)',
		color: '#7f8c8d',
		fontFamily: '"Outfit", "Inter", sans-serif'
	},
	spinner: {
		width: '12px',
		height: '12px',
		border: '2px solid rgba(160, 160, 160, 0.2)',
		borderTop: '2px solid #a0a0a0',
		borderRadius: '50%',
		marginRight: '8px',
		animation: 'spin 1s linear infinite'
	},
	tooltip: {
		position: 'absolute',
		bottom: '125%',
		left: '50%',
		transform: 'translateX(-50%)',
		width: '240px',
		padding: '14px',
		borderRadius: '12px',
		backgroundColor: 'rgba(18, 18, 22, 0.95)',
		border: '1px solid rgba(255, 255, 255, 0.12)',
		boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
		zIndex: 9999,
		color: '#ffffff',
		textAlign: 'left',
		backdropFilter: 'blur(12px)',
		WebkitBackdropFilter: 'blur(12px)'
	},
	tooltipTitle: {
		margin: '0 0 8px 0',
		fontSize: '13px',
		fontWeight: 600,
		color: '#e2e8f0',
		textTransform: 'uppercase',
		letterSpacing: '0.5px'
	},
	divider: {
		height: '1px',
		backgroundColor: 'rgba(255, 255, 255, 0.08)',
		margin: '8px 0'
	},
	statRow: {
		display: 'flex',
		justifyContent: 'space-between',
		fontSize: '12px',
		margin: '4px 0',
		color: '#94a3b8'
	},
	comparison: {
		fontSize: '11px',
		lineHeight: '1.4',
		color: '#cbd5e1',
		fontStyle: 'italic',
		backgroundColor: 'rgba(255, 255, 255, 0.03)',
		padding: '6px 10px',
		borderRadius: '6px'
	},
	leafIcon: {
		color: '#2ed573'
	},
	confidenceBadge: {
		marginTop: '8px',
		display: 'inline-block',
		padding: '2px 6px',
		borderRadius: '4px',
		fontSize: '9px',
		fontWeight: 700,
		color: '#cbd5e1',
		backgroundColor: 'rgba(255, 255, 255, 0.05)'
	}
};
