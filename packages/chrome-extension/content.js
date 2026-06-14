// Content script running on e-commerce pages

// Generic scraper for e-commerce metadata
function scrapeMetadata() {
	let title = '';
	let priceStr = '';
	let category = '';
	let brand = '';

	// 1. JSON-LD Parser
	try {
		const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
		for (const script of jsonLdScripts) {
			const data = JSON.parse(script.textContent);
			if (data && (data['@type'] === 'Product' || data['@type'] === 'http://schema.org/Product')) {
				title = data.name || title;
				brand = data.brand?.name || brand;
				category = data.category || category;
				if (data.offers) {
					if (Array.isArray(data.offers)) {
						priceStr = data.offers[0].price || priceStr;
					} else {
						priceStr = data.offers.price || priceStr;
					}
				}
			}
		}
	} catch (e) {
		console.warn('Carbon Companion: JSON-LD parse failed', e);
	}

	// 2. Open Graph Fallback
	if (!title) {
		const ogTitle = document.querySelector('meta[property="og:title"]');
		if (ogTitle) title = ogTitle.content;
	}
	if (!priceStr) {
		const ogPrice = document.querySelector('meta[property="product:price:amount"]');
		if (ogPrice) priceStr = ogPrice.content;
	}

	// 3. Amazon Specific DOM Scraper (High Accuracy override)
	if (window.location.hostname.includes('amazon.')) {
		const amzTitle = document.querySelector('#productTitle');
		if (amzTitle) title = amzTitle.textContent.trim();

		const amzPrice = document.querySelector('.a-price .a-offscreen') || document.querySelector('#priceblock_ourprice') || document.querySelector('.a-color-price');
		if (amzPrice) priceStr = amzPrice.textContent.trim();

		const amzBrand = document.querySelector('#bylineInfo');
		if (amzBrand) brand = amzBrand.textContent.trim();

		const amzCat = document.querySelector('#wayfinding-breadcrumbs_container');
		if (amzCat) category = amzCat.textContent.trim().replace(/\s+/g, ' ');
	}

	// Clean up values
	title = title ? title.replace(/\s+/g, ' ').trim() : '';
	priceStr = priceStr ? priceStr.replace(/[^0-9.]/g, '') : '0.00';
	const priceCents = Math.round(parseFloat(priceStr) * 100) || 0;

	return { title, priceCents, category, brand };
}

// Inline badge injection next to price or buy box
function injectBadge(score) {
	// Remove existing badge if present
	const oldBadge = document.querySelector('#carbon-companion-inline-badge');
	if (oldBadge) oldBadge.remove();

	// Find the price container or buy box
	let target = null;

	if (window.location.hostname.includes('amazon.')) {
		// Target price display on desktop
		target = document.querySelector('#corePriceDisplay_desktop_feature_div') || 
		         document.querySelector('#corePrice_desktop') || 
		         document.querySelector('#unifiedPrice_feature_div') ||
		         document.querySelector('#buybox');
	} else {
		// Generic targets
		target = document.querySelector('.price') || 
		         document.querySelector('[class*="price"]') || 
		         document.querySelector('#price');
	}

	if (!target) {
		console.warn('Carbon Companion: Price target element not found for inline injection. Falling back to bottom-right floating badge.');
		badge.style.cssText = `
			position: fixed;
			bottom: 20px;
			right: 20px;
			display: inline-flex;
			align-items: center;
			gap: 8px;
			background: ${config.bg};
			border: 1px solid ${config.border};
			color: ${config.text};
			padding: 8px 16px;
			border-radius: 12px;
			font-family: system-ui, -apple-system, sans-serif;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
			z-index: 1000000;
			transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		`;
		
		badge.onmouseover = () => {
			badge.style.transform = 'translateY(-2px)';
			badge.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.2)';
		};
		badge.onmouseout = () => {
			badge.style.transform = 'none';
			badge.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
		};

		const leafSvg = `
			<svg style="width: 15px; height: 15px; fill: currentColor;" viewBox="0 0 24 24">
				<path d="M17 8C8 10 5.9 16.17 3.8 21c4-.2 9.9-1.68 15-7.22 3.96-4.3 2-10.78 2-10.78S17.8 5 17 8zM6 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" opacity=".15"/>
				<path d="M2 22c0-5.52 4.48-10 10-10 1.93 0 3.72.55 5.25 1.5L20 10.75C20.67 9.17 21 7.33 21 5.37c0-2.42-1.96-4.37-4.38-4.37-2.92 0-5.5 1.5-6.9 3.75L6.25 1.25C4.75 2.78 4.2 4.57 4.2 6.5c0 5.52 4.48 10 10 10 .85 0 1.67-.1 2.47-.3L13.7 20.3C13.15 20.75 12.6 21 12 21c-5.52 0-10-4.48-10-10zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
			</svg>
		`;

		badge.innerHTML = `
			${leafSvg}
			<span>CO₂e Footprint: ${score.co2eKg.toFixed(2)} kg (${score.tier} impact)</span>
		`;

		document.body.appendChild(badge);
		
		badge.onclick = () => {
			chrome.runtime.sendMessage({ action: 'open_popup_tab' });
		};
		return;
	}


	// Create badge container
	const badge = document.createElement('div');
	badge.id = 'carbon-companion-inline-badge';

	// Glassmorphism and harmonious coloring
	const colors = {
		low: { bg: '#10b981', border: '#059669', text: '#ffffff' },
		medium: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
		high: { bg: '#ef4444', border: '#dc2626', text: '#ffffff' }
	};

	const config = colors[score.tier?.toLowerCase()] || colors.medium;

	badge.style.cssText = `
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: ${config.bg};
		border: 1px solid ${config.border};
		color: ${config.text};
		padding: 6px 12px;
		border-radius: 12px;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 13px;
		font-weight: 600;
		margin: 12px 0;
		cursor: pointer;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 99999;
	`;

	badge.onmouseover = () => {
		badge.style.transform = 'translateY(-1px)';
		badge.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.1)';
	};
	badge.onmouseout = () => {
		badge.style.transform = 'none';
		badge.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.05)';
	};

	// SVG Leaf Icon
	const leafSvg = `
		<svg style="width: 15px; height: 15px; fill: currentColor;" viewBox="0 0 24 24">
			<path d="M17 8C8 10 5.9 16.17 3.8 21c4-.2 9.9-1.68 15-7.22 3.96-4.3 2-10.78 2-10.78S17.8 5 17 8zM6 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" opacity=".15"/>
			<path d="M2 22c0-5.52 4.48-10 10-10 1.93 0 3.72.55 5.25 1.5L20 10.75C20.67 9.17 21 7.33 21 5.37c0-2.42-1.96-4.37-4.38-4.37-2.92 0-5.5 1.5-6.9 3.75L6.25 1.25C4.75 2.78 4.2 4.57 4.2 6.5c0 5.52 4.48 10 10 10 .85 0 1.67-.1 2.47-.3L13.7 20.3C13.15 20.75 12.6 21 12 21c-5.52 0-10-4.48-10-10zM12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
		</svg>
	`;

	badge.innerHTML = `
		${leafSvg}
		<span>CO₂e Footprint: ${score.co2eKg.toFixed(2)} kg (${score.tier} impact)</span>
	`;

	// Inject and style
	target.parentNode.insertBefore(badge, target.nextSibling);

	// Let user click to open the extension popup dashboard
	badge.onclick = () => {
		chrome.runtime.sendMessage({ action: 'open_popup_tab' });
	};
}

// Scrape cart or transaction data
function monitorPurchaseActions() {
	// Look for typical e-commerce add-to-cart clicks
	const cartButtons = [
		'#add-to-cart-button',
		'#add-to-cart-button-ubb',
		'input[name="submit.add-to-cart"]',
		'.add-to-cart',
		'button[class*="add-to-cart"]',
		'button[id*="add-to-cart"]'
	];

	cartButtons.forEach(selector => {
		const btn = document.querySelector(selector);
		if (btn) {
			btn.addEventListener('click', () => {
				const product = scrapeMetadata();
				if (product.title) {
					// Query score first then save to cart logs
					chrome.runtime.sendMessage({
						action: 'add_to_cart_log',
						product
					});
				}
			});
		}
	});

	// Check if this is a transaction confirmation/thank-you page
	const path = window.location.pathname.toLowerCase();
	const hostname = window.location.hostname;
	const isThankYou = path.includes('/thankyou') || 
	                  path.includes('/thank-you') || 
	                  path.includes('/confirmation') || 
	                  path.includes('/checkout/success') ||
	                  (hostname.includes('amazon.') && path.includes('/checkout/spc'));

	if (isThankYou) {
		// Log cart items saved and commit them to database sync
		chrome.runtime.sendMessage({ action: 'commit_purchased_cart' });
	}
}

// Execute on start
let retryCount = 0;
const maxRetries = 5;

function init() {
	const product = scrapeMetadata();
	if (product.title) {
		chrome.runtime.sendMessage({ 
			action: 'get_product_score', 
			title: product.title, 
			category: product.category 
		}, (response) => {
			if (response && response.co2eKg !== undefined) {
				injectBadge(response);
			}
		});
	} else if (retryCount < maxRetries) {
		retryCount++;
		console.log(`Carbon Companion: Product title not resolved. Retrying in 1s... (Attempt ${retryCount}/${maxRetries})`);
		setTimeout(init, 1000);
	}
	monitorPurchaseActions();
}

// Execute when page transitions complete
init();

// Support SPA URL changes (e.g. Amazon transitions)
let lastUrl = location.href;
new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
		lastUrl = url;
		retryCount = 0; // Reset retries for new page scan
		setTimeout(init, 1000);
	}
}).observe(document, { subtree: true, childList: true });

