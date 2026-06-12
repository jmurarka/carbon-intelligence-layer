import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { partnerId, sku, categoryId, customFactor, justification } = req.body;

  if (!partnerId || (!sku && !categoryId) || !customFactor) {
    return res.status(400).json({ error: 'Missing required fields. Provide SKU or Category ID, and Custom Factor.' });
  }

  try {
    const override = await prisma.partnerOverride.create({
      data: {
        partnerId,
        sku: sku || null,
        categoryId: categoryId || null,
        customFactor: Number(customFactor),
        justification: justification || null,
      },
    });

    return res.status(201).json(override);
  } catch (error: any) {
    console.error('API Error creating override:', error);
    return res.status(500).json({ error: 'Database failed to save override.', details: error.message });
  }
}
