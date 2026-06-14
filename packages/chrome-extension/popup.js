// Controller logic for Carbon Companion dropdown popup

const API_HOST = 'http://localhost:8081';
const API_KEY = 'cc_live_testkey123';

document.addEventListener('DOMContentLoaded', () => {
	initTabs();
	loadActiveScan();
	loadWalletStats();
	initBudgetSlider();

	// Redirect expand button click to full dashboard page
	document.getElementById('btn-expand').onclick = () => {
		chrome.runtime.sendMessage({ action: 'open_popup_tab' });
	};
});

// 1. Tab Navigation Routing
function initTabs() {
	const tabBtns = document.querySelectorAll('.tab-btn');
	const tabContents = document.querySelectorAll('.tab-content');

	tabBtns.forEach(btn => {
		btn.onclick = () => {
			const targetTab = btn.getAttribute('data-tab');

			tabBtns.forEach(b => b.classList.remove('active'));
			tabContents.forEach(c => c.classList.remove('active'));

			btn.classList.add('active');
			document.getElementById(targetTab).classList.add('active');

			if (targetTab === 'tab-wallet') {
				loadWalletStats();
			}
		};
	});
}

// 2. Load Active Page Product Details
function loadActiveScan() {
	chrome.storage.local.get(['currentScan', 'currentSuggestions'], (data) => {
		const loading = document.getElementById('scan-loading');
		const empty = document.getElementById('scan-empty');
		const scanData = document.getElementById('scan-data');

		if (!data.currentScan) {
			// Set timeout to show empty state if scanning takes long
			setTimeout(() => {
				chrome.storage.local.get(['currentScan'], (latest) => {
					if (!latest.currentScan) {
						loading.classList.add('hidden');
						empty.classList.remove('hidden');
						scanData.classList.add('hidden');
					}
				});
			}, 1500);
			return;
		}

		// Hide loading/empty, reveal data
		loading.classList.add('hidden');
		empty.classList.add('hidden');
		scanData.classList.remove('hidden');

		const scan = data.currentScan;
		document.getElementById('product-title').innerText = scan.title;
		document.getElementById('product-title').title = scan.title;

		const badge = document.getElementById('score-badge');
		const tier = scan.score.tier || 'Medium';
		badge.innerText = `CO₂e: ${scan.score.co2eKg.toFixed(2)} kg (${tier} Impact)`;
		badge.className = `badge tier-${tier.toLowerCase()}`;

		// Set badge HSL colors dynamically
		if (tier.toLowerCase() === 'low') {
			badge.style.color = '#10b981';
			badge.style.background = 'rgba(16, 185, 129, 0.1)';
			badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
		} else if (tier.toLowerCase() === 'high') {
			badge.style.color = '#ef4444';
			badge.style.background = 'rgba(239, 68, 68, 0.1)';
			badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
		} else {
			badge.style.color = '#f59e0b';
			badge.style.background = 'rgba(245, 158, 11, 0.1)';
			badge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
		}

		document.getElementById('score-comparison').innerText = `🌍 This item is ${scan.score.comparisonStatement || 'equivalent to driving 5 miles'}.`;

		// Load alternatives list
		const list = document.getElementById('alternatives-list');
		list.innerHTML = '';

		const suggestions = data.currentSuggestions?.suggestions || [];
		if (suggestions.length === 0) {
			list.innerHTML = `<div class="comparison-stmt">No alternatives found for this category.</div>`;
		} else {
			suggestions.forEach(alt => {
				const item = document.createElement('div');
				item.className = 'alternative-item';
				item.innerHTML = `
					<div class="alt-info">
						<span class="alt-title">${alt.title}</span>
						<span class="alt-saved">Save ${alt.co2e_saved_kg.toFixed(2)} kg CO₂e</span>
						<span class="alt-reason">${alt.reasoning}</span>
					</div>
					<button class="btn-swap" data-sku="${alt.sku}">Swap</button>
				`;

				const btn = item.querySelector('.btn-swap');
				btn.onclick = () => {
					// Simulate eco-swap transaction log
					executeMockSwap(scan.title, scan.score.co2eKg, alt.title, alt.co2e_kg, alt.price_cents);
				};

				list.appendChild(item);
			});
		}
	});
}

// Simulate Eco-swap log addition
function executeMockSwap(origTitle, origCo2e, newTitle, newCo2e, priceCents) {
	chrome.storage.local.get(['userId', 'cartItems'], async (res) => {
		const cart = res.cartItems || [];
		
		// Add synced log representing a completed green swap
		cart.push({
			productId: 'sku-swapped-' + Math.random().toString(36).substring(2, 6),
			productTitle: newTitle,
			categoryName: 'Eco-Swaps',
			co2eKg: newCo2e,
			swappedFromTitle: origTitle,
			swappedFromCo2e: origCo2e,
			priceCents: priceCents,
			createdAt: new Date().toISOString()
		});

		chrome.storage.local.set({ cartItems: cart }, () => {
			// Trigger direct sync
			chrome.runtime.sendMessage({ action: 'commit_purchased_cart' });
			alert(`Swapped successfully! Synced saving of ${(origCo2e - newCo2e).toFixed(2)} kg CO₂e to your wallet.`);
		});
	});
}

// 3. Load Wallet Statistics from Express API
function loadWalletStats() {
	chrome.storage.local.get(['userId', 'carbonLimit'], async (res) => {
		const userId = res.userId;
		if (!userId) return;

		const limit = res.carbonLimit || 25.0;

		try {
			const response = await fetch(`${API_HOST}/user/history/${userId}`, {
				headers: { 'Authorization': `Bearer ${API_KEY}` }
			});
			if (response.ok) {
				const data = await response.json();
				document.getElementById('stat-total-spent').innerText = `${data.totalCo2eKg.toFixed(1)} kg`;
				document.getElementById('stat-total-saved').innerText = `${data.totalSavedCo2eKg.toFixed(1)} kg`;

				// Find current week spent
				const currentWeekSpent = data.weeklySavings?.find(w => w.week === 'Current Week')?.co2eSpentKg || 0.0;
				
				// Update Progress Bar
				const pct = Math.min((currentWeekSpent / limit) * 100, 100);
				document.getElementById('budget-progress-label').innerText = `${currentWeekSpent.toFixed(1)} / ${limit.toFixed(0)} kg`;
				
				const bar = document.getElementById('budget-progress-bar');
				bar.style.width = `${pct}%`;

				// Color-code progress bar
				if (pct >= 90) {
					bar.style.backgroundColor = '#ef4444'; // Red
				} else if (pct >= 65) {
					bar.style.backgroundColor = '#f59e0b'; // Amber
				} else {
					bar.style.backgroundColor = '#10b981'; // Green
				}

				// Register sync reveal button
				document.getElementById('sync-backup-code').innerText = data.userId || res.userId;
				document.getElementById('btn-show-sync').onclick = () => {
					const box = document.getElementById('sync-key-box');
					const btn = document.getElementById('btn-show-sync');
					if (box.classList.contains('hidden')) {
						box.classList.remove('hidden');
						btn.innerText = 'Hide Key';
					} else {
						box.classList.add('hidden');
						btn.innerText = 'Reveal Key';
					}
				};
			}
		} catch (e) {
			console.error('Failed to load user savings history', e);
		}
	});
}

// 4. Budget limit slider initialization
function initBudgetSlider() {
	const slider = document.getElementById('limit-slider');
	const label = document.getElementById('limit-val');

	chrome.storage.local.get(['carbonLimit'], (res) => {
		if (res.carbonLimit) {
			slider.value = res.carbonLimit;
			label.innerText = res.carbonLimit;
		}
	});

	slider.oninput = () => {
		label.innerText = slider.value;
		chrome.storage.local.set({ carbonLimit: parseFloat(slider.value) }, () => {
			loadWalletStats();
		});
	};
}
