import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare('SELECT * FROM budgets ORDER BY bud_id ASC').all();
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

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO budgets (org_id, cat_id, amount, period, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                Number(bodyOrgId),
                Number(cat_id),
                parseFloat(amount),
                String(period).trim(),
                now
            );

            const bud_id = Number(result.lastInsertRowid);
            const doc = {
                id: bud_id,
                bud_id,
                org_id: Number(bodyOrgId),
                cat_id: Number(cat_id),
                amount: parseFloat(amount),
                period: String(period).trim(),
                createdAt: now
            };

            return res.status(200).json(doc);
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, cat_id, amount, period } = req.body;
            const numId = Number(id);
            const now = new Date().toISOString();

            db.prepare(`
                UPDATE budgets
                SET org_id = ?,
                    cat_id = ?,
                    amount = ?,
                    period = ?,
                    updatedAt = ?
                WHERE bud_id = ?
            `).run(
                Number(bodyOrgId),
                Number(cat_id),
                parseFloat(amount),
                String(period).trim(),
                now,
                numId
            );

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            db.prepare('DELETE FROM budgets WHERE bud_id = ?').run(numId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in budgets:', err);
        return res.status(500).json({ error: err.message });
    }
}
