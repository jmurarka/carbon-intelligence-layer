// Controller logic for full-page analytics dashboard portal

const API_HOST = 'http://localhost:8081';
const API_KEY = 'cc_live_testkey123';

document.addEventListener('DOMContentLoaded', () => {
	loadDashboardData();
});

// Load all stats, charts, and table logs from Express API
function loadDashboardData() {
	chrome.storage.local.get(['userId', 'carbonLimit'], async (res) => {
		const userId = res.userId;
		if (!userId) {
			console.warn('Carbon Companion: No active userId found.');
			return;
		}

		const limit = res.carbonLimit || 25.0;

		// Set backup sync ID display
		const syncId = document.getElementById('user-sync-id');
		syncId.innerText = userId;
		syncId.onclick = () => {
			navigator.clipboard.writeText(userId);
			alert('Sync token copied to clipboard!');
		};

		try {
			const response = await fetch(`${API_HOST}/user/history/${userId}`, {
				headers: { 'Authorization': `Bearer ${API_KEY}` }
			});
			if (response.ok) {
				const data = await response.json();

				// 1. Update stats row
				document.getElementById('lbl-total-saved').innerText = `${data.totalSavedCo2eKg.toFixed(1)} kg`;
				document.getElementById('lbl-total-items').innerText = `${data.logs?.length || 0} items`;

				// Calc average week spent
				const weeklyStats = data.weeklySavings || [];
				const spentWeeks = weeklyStats.map(w => w.co2eSpentKg);
				const avgSpent = spentWeeks.reduce((sum, val) => sum + val, 0) / (spentWeeks.length || 1);
				document.getElementById('lbl-avg-spent').innerText = `${avgSpent.toFixed(1)} kg`;

				// Calc budget compliance rate
				const totalWeeks = spentWeeks.length || 1;
				const compliantWeeks = spentWeeks.filter(spent => spent <= limit).length;
				const compliancePct = Math.round((compliantWeeks / totalWeeks) * 100);
				document.getElementById('lbl-compliance').innerText = `${compliancePct}%`;

				// 2. Render weekly bar chart
				renderBarChart(weeklyStats);

				// 3. Render ledger logs table
				renderLedgerTable(data.logs || []);
			}
		} catch (e) {
			console.error('Carbon Companion Portal: Failed to fetch history', e);
		}
	});
}

// Render the bar chart using CSS vertical height calculations
function renderBarChart(weeks) {
	const chart = document.getElementById('trend-bar-chart');
	chart.innerHTML = '';

	if (weeks.length === 0) {
		chart.innerHTML = `<div style="color:#64748b; font-size:12px; text-align:center;">No history recorded yet.</div>`;
		return;
	}

	// Find max value in data to scale heights
	const values = weeks.flatMap(w => [w.co2eSpentKg, w.co2eSavedKg]);
	const maxVal = Math.max(...values, 10.0); // Minimum scale baseline of 10kg

	weeks.reverse().forEach(w => {
		const spentHeight = (w.co2eSpentKg / maxVal) * 120;
		const savedHeight = (w.co2eSavedKg / maxVal) * 120;

		const barGroup = document.createElement('div');
		barGroup.className = 'chart-bar-group';
		barGroup.innerHTML = `
			<div class="bar-container">
				<div class="bar-spent" style="height: ${spentHeight}px;" title="Spent: ${w.co2eSpentKg.toFixed(1)} kg CO₂e"></div>
				<div class="bar-saved" style="height: ${savedHeight}px;" title="Saved: ${w.co2eSavedKg.toFixed(1)} kg CO₂e"></div>
			</div>
			<span class="bar-label">${w.week}</span>
		`;
		chart.appendChild(barGroup);
	});
}

// Render ledger log items in tabular layout
function renderLedgerTable(logs) {
	const tbody = document.getElementById('ledger-body');
	tbody.innerHTML = '';

	if (logs.length === 0) {
		tbody.innerHTML = `
			<tr>
				<td colspan="6" style="text-align:center; color:#64748b; padding:40px 0;">
					No transaction logs registered in this account.
				</td>
			</tr>
		`;
		return;
	}

	logs.forEach(log => {
		const row = document.createElement('tr');

		// Date format
		const dateStr = new Date(log.createdAt).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});

		// Price format
		const priceStr = `$${(log.priceCents / 100).toFixed(2)}`;

		// Carbon footprint formatting
		const co2e = `${Number(log.co2eKg).toFixed(2)} kg`;

		// Eco-swap checking
		let swapStatus = '';
		if (log.swappedFromTitle) {
			const saved = Number(log.swappedFromCo2e) - Number(log.co2eKg);
			swapStatus = `<span class="text-green" style="font-weight:700;">Eco-Swapped</span><br><span style="font-size:10px;color:#64748b;">Saved ${saved.toFixed(2)} kg (Replacing "${log.swappedFromTitle}")</span>`;
		} else {
			swapStatus = `<span style="color:#64748b;">Direct Purchase</span>`;
		}

		row.innerHTML = `
			<td>${dateStr}</td>
			<td style="font-weight:600;">${log.productTitle}</td>
			<td>${log.categoryName}</td>
			<td>${priceStr}</td>
			<td>${co2e}</td>
			<td>${swapStatus}</td>
		`;

		tbody.appendChild(row);
	});
}
