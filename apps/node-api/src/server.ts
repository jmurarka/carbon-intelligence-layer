import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
	resolveProductScore,
	getAlternativesSuggestions,
	getCommuteOptions,
	mockCatalog
} from './scoring';
import syncRouter from './routes/sync';

const prisma = new PrismaClient();

const app = express();
const port = process.env.NODE_PORT || 8081;

// Middleware
app.use(cors({
	origin: '*',
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json());
app.use(morgan('dev'));

// Helper to check DB connectivity
async function isDbOnline(): Promise<boolean> {
	if (!process.env.DATABASE_URL) return false;
	try {
		await prisma.$queryRaw`SELECT 1`;
		return true;
	} catch (e) {
		return false;
	}
}

// SHA-256 Token Verification Middleware
async function authenticateKey(req: express.Request, res: express.Response, next: express.NextFunction) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		res.status(401).json({ error: 'Unauthorized. Bearer token missing.' });
		return;
	}

	const token = authHeader.substring(7).trim();
	if (!token) {
		res.status(401).json({ error: 'Unauthorized. Invalid token.' });
		return;
	}

	// Local Mock Bypass
	if (token === 'cc_live_testkey123') {
		(req as any).partnerId = 'a0f7c222-38b8-4d57-814d-61c02b11ea99';
		next();
		return;
	}

	const dbActive = await isDbOnline();
	if (!dbActive) {
		res.status(401).json({ error: 'Unauthorized. Database offline, key verification unavailable.' });
		return;
	}

	try {
		// Hash token via SHA-256
		const hashedKey = createHash('sha256').update(token).digest('hex');
		const partnerKey = await prisma.partnerKey.findFirst({
			where: {
				hashedKey,
				status: 'active'
			}
		});

		if (!partnerKey) {
			res.status(401).json({ error: 'Unauthorized. Invalid or revoked API key.' });
			return;
		}

		(req as any).partnerId = partnerKey.partnerId;
		next();
	} catch (err: any) {
		res.status(401).json({ error: `Unauthorized. Authentication error: ${err.message}` });
	}
}

// In-memory Sliding Window Rate Limiter
const rateLimitWindowMs = 60000; // 1 minute
const maxRequestsPerWindow = 100; // 100 requests per minute
const requestTimestamps = new Map<string, number[]>();

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
	const key = (req as any).partnerId || req.ip || 'global';
	const now = Date.now();
	let timestamps = requestTimestamps.get(key) || [];

	// Filter out timestamps older than the sliding window limit
	timestamps = timestamps.filter(ts => now - ts < rateLimitWindowMs);

	if (timestamps.length >= maxRequestsPerWindow) {
		res.status(429).json({ error: 'Too many requests. Rate limit exceeded.' });
		return;
	}

	timestamps.push(now);
	requestTimestamps.set(key, timestamps);
	next();
}

// Apply Auth and Rate Limiting globally for endpoints
app.use(authenticateKey);
app.use(rateLimiter);

// Mount Chrome Extension Sync Routes
app.use('/user', syncRouter);


// Helper to query transport factor
async function getTransportFactor(modeName: string) {
	const dbActive = await isDbOnline();
	if (dbActive) {
		try {
			return await prisma.transportFactor.findFirst({
				where: { modeName }
			});
		} catch (e) {
			// ignore and fallback
		}
	}
	// Mock fallback database
	const mockTf: Record<string, { co2ePerKmPassenger: number, co2ePerKmTon: number }> = {
		'diesel_van': { co2ePerKmPassenger: 0.18, co2ePerKmTon: 0.8 },
		'ev_car': { co2ePerKmPassenger: 0.04, co2ePerKmTon: 0.2 },
		'public_transit': { co2ePerKmPassenger: 0.02, co2ePerKmTon: 0.1 },
		'bicycle': { co2ePerKmPassenger: 0.0, co2ePerKmTon: 0.0 }
	};
	return mockTf[modeName] ? {
		co2ePerKmPassenger: mockTf[modeName].co2ePerKmPassenger,
		co2ePerKmTon: mockTf[modeName].co2ePerKmTon
	} : null;
}

// Endpoints
// 1. Single product score lookup
app.get('/carbon-score/:product_id', async (req, res, next) => {
	const { product_id } = req.params;
	const weightGrams = req.query.weight_grams ? parseInt(req.query.weight_grams as string, 10) : undefined;
	const title = req.query.title as string | undefined;
	const categoryName = req.query.category_name as string | undefined;
	const partnerId = (req as any).partnerId;

	try {
		const score = await resolveProductScore(partnerId, product_id, weightGrams, title, categoryName);
		res.json(score);
	} catch (err) {
		next(err);
	}
});

// 2. Batch score lookup
app.post('/carbon-score/batch', async (req, res, next) => {
	const { items } = req.body;
	if (!items || !Array.isArray(items)) {
		res.status(400).json({ error: 'Invalid JSON payload. Expected "items" array.' });
		return;
	}
	if (items.length > 50) {
		res.status(400).json({ error: 'Batch limits exceeded. Max 50 items allowed per batch.' });
		return;
	}

	const partnerId = (req as any).partnerId;
	try {
		const results = [];
		for (const item of items) {
			const productId = item.productId || item.sku;
			if (!productId) continue;
			const score = await resolveProductScore(partnerId, productId, item.weightGrams, item.title);
			results.push({
				productId,
				co2eKg: score.co2eKg,
				tier: score.tier,
				calculationMethod: score.calculationMethod
			});
		}
		res.json({ results });
	} catch (err) {
		next(err);
	}
});

// 3. Checkout summary aggregation
app.post('/checkout/summary', async (req, res, next) => {
	const { items, logistics } = req.body;
	if (!items || !Array.isArray(items)) {
		res.status(400).json({ error: 'Invalid JSON payload. Expected "items" array.' });
		return;
	}

	const partnerId = (req as any).partnerId;
	try {
		let productTotalCO2e = 0;
		let totalWeightGrams = 0;

		const scores = [];
		for (const item of items) {
			const productId = item.productId || item.sku;
			if (!productId) continue;

			// Resolve unit weight
			let unitWeight = item.weightGrams || 0;
			if (unitWeight <= 0) {
				const dbActive = await isDbOnline();
				if (dbActive) {
					try {
						const catalogItem = await prisma.productCatalog.findFirst({
							where: { partnerId, sku: productId }
						});
						if (catalogItem && catalogItem.attributes) {
							const attrs = catalogItem.attributes as any;
							if (attrs && typeof attrs.weight_grams === 'number') {
								unitWeight = attrs.weight_grams;
							}
						}
					} catch (e) {}
				} else {
					const mockCatalogItem = mockCatalog.find(c => c.sku === productId);
					if (mockCatalogItem) {
						unitWeight = mockCatalogItem.weightGrams;
					}
				}
			}

			const score = await resolveProductScore(partnerId, productId, unitWeight, item.title);
			const quantity = item.quantity || 1;
			productTotalCO2e += score.co2eKg * quantity;
			totalWeightGrams += unitWeight * quantity;

			scores.push({ score, quantity, productId });
		}

		// Calculate logistics overhead
		let logisticsCO2e = 0;
		if (logistics && logistics.transportMode && logistics.distanceKm > 0) {
			const tf = await getTransportFactor(logistics.transportMode);
			if (tf) {
				const totalTons = totalWeightGrams / 1000000.0;
				if (totalTons > 0 && tf.co2ePerKmTon) {
					logisticsCO2e = Number(tf.co2ePerKmTon) * logistics.distanceKm * totalTons;
				} else {
					logisticsCO2e = Number(tf.co2ePerKmPassenger) * logistics.distanceKm;
				}
			}
		}

		const grandTotal = productTotalCO2e + logisticsCO2e;
		const milesDriven = grandTotal / 0.40;
		const treeDays = grandTotal / 0.06;

		// Offset calculation
		const offsetProjects = [
			{
				id: 'proj-reforest-pnw',
				name: 'Reforestation in Pacific Northwest',
				type: 'forestry',
				costPerTonCents: 3500
			},
			{
				id: 'proj-soil-midwest',
				name: 'Regenerative Agriculture Midwest Soil',
				type: 'soil_sequestration',
				costPerTonCents: 2000
			},
			{
				id: 'proj-dac-climeworks',
				name: 'Direct Air Capture (Climeworks Iceland)',
				type: 'direct_air_capture',
				costPerTonCents: 15000
			}
		].map(p => {
			const cost = (p.costPerTonCents / 1000.0) * grandTotal;
			let costCents = Math.ceil(cost);
			if (costCents < 5) costCents = 5;
			return {
				id: p.id,
				name: p.name,
				type: p.type,
				costPerTonCents: p.costPerTonCents,
				calculatedCostCents: costCents
			};
		});

		const suggestedOffset = offsetProjects.length > 0 ? offsetProjects[0].calculatedCostCents : 0;
		const suggestedName = offsetProjects.length > 0 ? offsetProjects[0].name : '';

		// Dynamic alternative suggestion: find the highest impact item in the cart and query substitute
		let alternativeSuggestion = null;
		if (scores.length > 0) {
			let highestScoreItem = scores[0];
			for (const item of scores) {
				if (item.score.co2eKg > highestScoreItem.score.co2eKg) {
					highestScoreItem = item;
				}
			}
			if (highestScoreItem.score.categoryId) {
				alternativeSuggestion = await getAlternativesSuggestions(
					partnerId,
					highestScoreItem.score.categoryId,
					highestScoreItem.productId,
					highestScoreItem.score.co2eKg
				);
			}
		}

		res.json({
			orderTotalCo2eKg: Math.round(productTotalCO2e * 100) / 100,
			logisticsCo2eKg: Math.round(logisticsCO2e * 100) / 100,
			grandTotalCo2eKg: Math.round(grandTotal * 100) / 100,
			comparisons: {
				milesDriven: Math.round(milesDriven * 10) / 10,
				treeDaysAbsorbed: Math.round(treeDays)
			},
			offsetOptions: {
				suggestedOffsetCents: suggestedOffset,
				projectName: suggestedName,
				projects: offsetProjects
			},
			alternativeSuggestion
		});
	} catch (err) {
		next(err);
	}
});

// 4. Travel options commute compare
app.get('/commute/options', async (req, res, next) => {
	const distanceKm = req.query.distance_km ? parseFloat(req.query.distance_km as string) : 1.0;
	try {
		const options = await getCommuteOptions(distanceKm);
		res.json(options);
	} catch (err) {
		next(err);
	}
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error('Express Global Error:', err);
	res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Bootstrap server
if (process.env.NODE_ENV !== 'test') {
	app.listen(port, () => {
		console.log(`Carbon Companion Node Server running on http://localhost:${port}`);
	});
}

export default app;
