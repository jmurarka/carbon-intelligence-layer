// Chrome Extension background service worker (Manifest V3)

const API_HOST = 'http://localhost:8081';
const API_KEY = 'cc_live_testkey123'; // Default sandbox key

// Init user account registration on install
chrome.runtime.onInstalled.addListener(async () => {
	chrome.storage.local.get(['userId'], async (result) => {
		if (!result.userId) {
			console.log('Carbon Companion: No userId found. Registering anonymous user...');
			try {
				const response = await fetch(`${API_HOST}/user/register`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${API_KEY}`,
						'Content-Type': 'application/json'
					}
				});
				if (response.ok) {
					const data = await response.json();
					chrome.storage.local.set({
						userId: data.userId,
						backupCode: data.backupCode,
						cartItems: [],
						carbonLimit: 25.0 // Default weekly budget 25kg CO2
					});
					console.log('Carbon Companion: User registered successfully. UUID:', data.userId);
				} else {
					throw new Error('Registration API error');
				}
			} catch (e) {
				console.error('Carbon Companion: Registration failed. Using local fallback.', e);
				// Fallback local registration until server is online
				const localId = 'usr_local_' + Math.random().toString(36).substring(2, 15);
				chrome.storage.local.set({
					userId: localId,
					backupCode: 'CC-BACKUP-LOCAL',
					cartItems: [],
					carbonLimit: 25.0
				});
			}
		}
	});
});

// Helper to query score from Express Gateway
async function fetchProductScore(title, category) {
	// Generate clean ID from title keywords
	const cleanTitleId = 'sku-' + title.substring(0, 15).toLowerCase().replace(/[^a-z0-9]/g, '-');
	const url = `${API_HOST}/carbon-score/${cleanTitleId}?title=${encodeURIComponent(title)}&category_name=${encodeURIComponent(category || '')}&weight_grams=1000`;

	try {
		const res = await fetch(url, {
			headers: { 'Authorization': `Bearer ${API_KEY}` }
		});
		if (!res.ok) throw new Error('Failed to fetch score');
		return await res.json();
	} catch (e) {
		console.warn('Carbon Companion API query failed. Using mock estimation.', e);
		// Local fallback estimation
		const isHigh = title.toLowerCase().includes('meat') || title.toLowerCase().includes('beef') || title.toLowerCase().includes('steak') || title.toLowerCase().includes('phone') || title.toLowerCase().includes('laptop');
		const isMedium = title.toLowerCase().includes('dairy') || title.toLowerCase().includes('milk') || title.toLowerCase().includes('cheese');
		return {
			productId: cleanTitleId,
			co2eKg: isHigh ? 8.5 : (isMedium ? 2.5 : 0.8),
			tier: isHigh ? 'High' : (isMedium ? 'Medium' : 'Low'),
			confidenceScore: 'medium',
			calculationMethod: 'category_fallback',
			comparisonStatement: `equivalent to driving ${isHigh ? 21 : (isMedium ? 6 : 2)} miles in a gas car`
		};
	}
}

// Orchestrate messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'get_product_score') {
		fetchProductScore(request.title, request.category).then(score => {
			// Save in local storage as current view scan
			chrome.storage.local.set({ currentScan: { title: request.title, score } });

			// Request suggestions for popup
			fetchSuggestions(score.productId).then(suggestions => {
				chrome.storage.local.set({ currentSuggestions: suggestions });
			});

			sendResponse(score);
		});
		return true; // Keep message channel open for async response
	}

	if (request.action === 'add_to_cart_log') {
		const product = request.product;
		fetchProductScore(product.title, product.category).then(score => {
			chrome.storage.local.get(['cartItems'], (res) => {
				const cart = res.cartItems || [];
				cart.push({
					productId: score.productId,
					productTitle: product.title,
					categoryName: product.category || 'General',
					co2eKg: score.co2eKg,
					priceCents: product.priceCents,
					createdAt: new Date().toISOString()
				});
				chrome.storage.local.set({ cartItems: cart });
				console.log('Carbon Companion: Added product score to local cart log.');
			});
		});
		return true;
	}

	if (request.action === 'commit_purchased_cart') {
		chrome.storage.local.get(['userId', 'cartItems'], async (res) => {
			const cart = res.cartItems || [];
			if (cart.length === 0) return;

			try {
				const syncRes = await fetch(`${API_HOST}/user/sync`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${API_KEY}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						userId: res.userId,
						logs: cart
					})
				});

				if (syncRes.ok) {
					// Calculate totals for notification
					const totalCo2 = cart.reduce((sum, item) => sum + item.co2eKg, 0);

					chrome.notifications.create({
						type: 'basic',
						iconUrl: 'icon.png',
						title: 'Carbon Impact Synced!',
						message: `Tracked purchase of ${cart.length} items. Total footprint: ${totalCo2.toFixed(1)} kg CO₂e has been added to your Carbon Wallet.`,
						priority: 1
					});

					// Reset cart
					chrome.storage.local.set({ cartItems: [] });
					console.log('Carbon Companion: Successfully synced transaction logs to DB.');
				}
			} catch (e) {
				console.error('Carbon Companion: Sync transaction error', e);
			}
		});
		return true;
	}

	if (request.action === 'open_popup_tab') {
		chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
		return true;
	}
});

// Fetch alternatives suggestions from Express API
async function fetchSuggestions(sku) {
	try {
		const res = await fetch(`${API_HOST}/carbon-score/${sku}`, {
			headers: { 'Authorization': `Bearer ${API_KEY}` }
		});
		if (!res.ok) throw new Error();
		const detail = await res.json();
		// In fallback/offline, we suggest Oat Milk for Almond Milk, or EV transit for Diesel transit
		if (sku.includes('almondmilk')) {
			return {
				suggestions: [{
					sku: 'sku-oatmilk-local',
					title: 'Oat Milk Local (Eco-Swap)',
					co2e_kg: 0.7,
					co2e_saved_kg: 1.8,
					price_cents: 450,
					reasoning: 'Oat milk has significantly lower water and land impact compared to almond milk.'
				}]
			};
		}
		// Default suggestions
		return {
			suggestions: [{
				sku: sku + '-eco',
				title: 'Organic Eco-alternative',
				co2e_kg: detail.co2eKg * 0.6,
				co2e_saved_kg: detail.co2eKg * 0.4,
				price_cents: 300,
				reasoning: 'Produced locally, reducing shipping logistics emissions.'
			}]
		};
	} catch {
		return {
			suggestions: [{
				sku: sku + '-eco',
				title: 'Organic Eco-alternative',
				co2e_kg: 1.2,
				co2e_saved_kg: 1.5,
				price_cents: 350,
				reasoning: 'Produced locally with sustainable packaging.'
			}]
		};
	}
}
