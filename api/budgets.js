/**
 * Budgets API — /api/budgets
 * org_id from session — not client-supplied.
 */
import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    const orgId = req.orgId; // from session via requireAuth

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare('SELECT * FROM budgets WHERE org_id = ? ORDER BY bud_id ASC').all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { cat_id, amount, period } = req.body;
            if (!cat_id) return res.status(400).json({ error: 'Category is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive budget amount is required' });
            }
            if (!period) return res.status(400).json({ error: 'Budget period is required' });

            // Verify category belongs to this org
            const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(Number(cat_id), orgId);
            if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO budgets (org_id, cat_id, amount, period, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `).run(orgId, Number(cat_id), parseFloat(amount), String(period).trim(), now);

            const bud_id = Number(result.lastInsertRowid);
            return res.status(200).json({
                id: bud_id, bud_id, org_id: orgId,
                cat_id: Number(cat_id),
                amount: parseFloat(amount),
                period: String(period).trim(),
                createdAt: now
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { cat_id, amount, period } = req.body;
            const numId = Number(id);

            // Verify ownership
            const bud = db.prepare('SELECT bud_id FROM budgets WHERE bud_id = ? AND org_id = ?').get(numId, orgId);
            if (!bud) return res.status(403).json({ error: 'Budget not found for your organisation.' });

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE budgets SET cat_id = ?, amount = ?, period = ?, updatedAt = ?
                WHERE bud_id = ? AND org_id = ?
            `).run(Number(cat_id), parseFloat(amount), String(period).trim(), now, numId, orgId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify ownership
            const bud = db.prepare('SELECT bud_id FROM budgets WHERE bud_id = ? AND org_id = ?').get(numId, orgId);
            if (!bud) return res.status(403).json({ error: 'Budget not found for your organisation.' });

            db.prepare('DELETE FROM budgets WHERE bud_id = ? AND org_id = ?').run(numId, orgId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in budgets:', err);
        return res.status(500).json({ error: err.message });
    }
}
