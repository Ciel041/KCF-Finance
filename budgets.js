import { getDb, getNextSequence } from '../lib/mongodb.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = await getDb();

        if (method === 'GET') {
            const rows = await db.collection('budgets')
                .find({})
                .sort({ bud_id: 1 })
                .toArray();
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { org_id: bodyOrgId, cat_id, amount, period } = req.body;
            if (!bodyOrgId) return res.status(400).json({ error: 'Organisation ID is required' });
            if (!cat_id) return res.status(400).json({ error: 'Category is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive budget amount is required' });
            }
            if (!period) return res.status(400).json({ error: 'Budget period is required' });

            const bud_id = await getNextSequence('bud_id');
            const doc = {
                bud_id,
                org_id: Number(bodyOrgId),
                cat_id: Number(cat_id),
                amount: parseFloat(amount),
                period: String(period).trim(),
                createdAt: new Date()
            };

            await db.collection('budgets').insertOne(doc);
            return res.status(200).json({ id: bud_id, ...doc });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, cat_id, amount, period } = req.body;
            const numId = Number(id);

            await db.collection('budgets').updateOne(
                { bud_id: numId },
                {
                    $set: {
                        org_id: Number(bodyOrgId),
                        cat_id: Number(cat_id),
                        amount: parseFloat(amount),
                        period: String(period).trim(),
                        updatedAt: new Date()
                    }
                }
            );
            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            await db.collection('budgets').deleteOne({ bud_id: numId });
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in budgets:', err);
        return res.status(500).json({ error: err.message });
    }
}
