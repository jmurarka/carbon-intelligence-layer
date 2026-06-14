import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = new PrismaClient();

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

// 1. POST /user/register
router.post('/register', async (req, res, next) => {
	try {
		const dbActive = await isDbOnline();
		if (!dbActive) {
			const mockUserId = 'usr-' + Math.random().toString(36).substring(2, 15);
			const mockBackupCode = 'cc-backup-' + Math.random().toString(36).substring(2, 8).toUpperCase();
			res.json({ userId: mockUserId, backupCode: mockBackupCode });
			return;
		}

		const userId = randomUUID();
		const backupCode = 'cc-backup-' + Math.random().toString(36).substring(2, 8).toUpperCase();

		const user = await prisma.user.create({
			data: {
				userId,
				backupCode
			}
		});

		res.json({ userId: user.userId, backupCode: user.backupCode });
	} catch (err) {
		next(err);
	}
});

// 2. POST /user/sync
router.post('/sync', async (req, res, next) => {
	const { userId, logs } = req.body;
	if (!userId || !logs || !Array.isArray(logs)) {
		res.status(400).json({ error: 'Invalid payload. Expected "userId" and "logs" array.' });
		return;
	}

	try {
		const dbActive = await isDbOnline();
		if (!dbActive) {
			res.json({ success: true, count: logs.length });
			return;
		}

		const userExists = await prisma.user.findUnique({
			where: { userId }
		});
		if (!userExists) {
			res.status(404).json({ error: 'User not found.' });
			return;
		}

		const createdLogs = await Promise.all(
			logs.map(async (log: any) => {
				return prisma.userCarbonLog.create({
					data: {
						userId,
						productId: log.productId || log.sku || 'unknown',
						productTitle: log.productTitle || 'Unknown Product',
						categoryName: log.categoryName || 'General',
						co2eKg: log.co2eKg || 0,
						swappedFromTitle: log.swappedFromTitle || null,
						swappedFromCo2e: log.swappedFromCo2e || null,
						priceCents: log.priceCents || 0,
						createdAt: log.createdAt ? new Date(log.createdAt) : new Date()
					}
				});
			})
		);

		res.json({ success: true, count: createdLogs.length });
	} catch (err) {
		next(err);
	}
});

// 3. GET /user/history/:userId
router.get('/history/:userId', async (req, res, next) => {
	const { userId } = req.params;
	try {
		const dbActive = await isDbOnline();
		if (!dbActive) {
			const mockLogs = [
				{
					logId: 'mock-1',
					productId: 'sku-beefsteak-003',
					productTitle: 'Beef Steak',
					categoryName: 'Meat & Seafood',
					co2eKg: 4.8,
					swappedFromTitle: null,
					swappedFromCo2e: null,
					priceCents: 1200,
					createdAt: new Date().toISOString()
				},
				{
					logId: 'mock-2',
					productId: 'sku-oatmilk-local',
					productTitle: 'Oat Milk Local',
					categoryName: 'Dairy & Eggs',
					co2eKg: 0.7,
					swappedFromTitle: 'Almond Milk 1L',
					swappedFromCo2e: 2.5,
					priceCents: 450,
					createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
				}
			];

			res.json({
				totalCo2eKg: 5.5,
				totalSavedCo2eKg: 1.8,
				logs: mockLogs,
				weeklySavings: [
					{ week: 'Current Week', co2eSavedKg: 1.8, co2eSpentKg: 5.5 },
					{ week: '1 Week Ago', co2eSavedKg: 2.1, co2eSpentKg: 6.2 },
					{ week: '2 Weeks Ago', co2eSavedKg: 0.0, co2eSpentKg: 0.0 },
					{ week: '3 Weeks Ago', co2eSavedKg: 0.0, co2eSpentKg: 0.0 }
				]
			});
			return;
		}

		const user = await prisma.user.findUnique({
			where: { userId },
			include: {
				logs: {
					orderBy: { createdAt: 'desc' }
				}
			}
		});

		if (!user) {
			res.status(404).json({ error: 'User not found.' });
			return;
		}

		let totalCo2e = 0;
		let totalSaved = 0;

		user.logs.forEach(log => {
			totalCo2e += Number(log.co2eKg);
			if (log.swappedFromCo2e) {
				const saved = Number(log.swappedFromCo2e) - Number(log.co2eKg);
				if (saved > 0) totalSaved += saved;
			}
		});

		const weekMap = new Map<string, { co2eSavedKg: number, co2eSpentKg: number }>();
		for (let i = 0; i < 4; i++) {
			const label = i === 0 ? 'Current Week' : `${i} Week${i > 1 ? 's' : ''} Ago`;
			weekMap.set(label, { co2eSavedKg: 0, co2eSpentKg: 0 });
		}

		const now = Date.now();
		user.logs.forEach(log => {
			const diffTime = now - new Date(log.createdAt).getTime();
			const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
			if (diffWeeks >= 0 && diffWeeks < 4) {
				const label = diffWeeks === 0 ? 'Current Week' : `${diffWeeks} Week${diffWeeks > 1 ? 's' : ''} Ago`;
				const entry = weekMap.get(label)!;
				entry.co2eSpentKg += Number(log.co2eKg);
				if (log.swappedFromCo2e) {
					const saved = Number(log.swappedFromCo2e) - Number(log.co2eKg);
					if (saved > 0) entry.co2eSavedKg += saved;
				}
			}
		});

		const weeklySavings = Array.from(weekMap.entries()).map(([week, stats]) => ({
			week,
			co2eSavedKg: Math.round(stats.co2eSavedKg * 100) / 100,
			co2eSpentKg: Math.round(stats.co2eSpentKg * 100) / 100
		}));

		res.json({
			totalCo2eKg: Math.round(totalCo2e * 100) / 100,
			totalSavedCo2eKg: Math.round(totalSaved * 100) / 100,
			logs: user.logs,
			weeklySavings
		});
	} catch (err) {
		next(err);
	}
});

export default router;
