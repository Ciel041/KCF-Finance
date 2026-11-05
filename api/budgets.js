/**
 * Budgets API — /api/budgets
 * org_id from session — not client-supplied.
 *
 * 2NF update: period is now stored as period_type + period_value columns.
 * Accepts both old `period` string (for backwards compat) and new
 * `period_type` + `period_value` fields from the client.
 */
import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    const orgId = req.orgId; // from session via requireAuth

    try {
        const db = getDb();

        if (method === 'GET') {
            // Join through categories to derive org for filtering (2NF-compliant read path)
            const rows = db.prepare(`
                SELECT
                    b.bud_id,
                    b.cat_id,
                    b.amount,
                    b.period_type,
                    b.period_value,
                    b.createdAt,
                    b.updatedAt,
                    COALESCE(c.cat_name, '') AS cat_name,
                    c.org_id
                FROM budgets b
                LEFT JOIN categories c ON b.cat_id = c.cat_id
                WHERE c.org_id = ?
                ORDER BY b.bud_id ASC
            `).all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { cat_id, amount } = req.body;
            // Accept new period_type+period_value or legacy period string
            let { period_type, period_value, period } = req.body;

            if (!cat_id) return res.status(400).json({ error: 'Category is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive budget amount is required' });
            }

            // Resolve period_type + period_value
            if (period && (!period_type || !period_value)) {
                const p = String(period).trim();
                if (/^\d{4}-Q\d$/.test(p))   { period_type = 'quarterly'; period_value = p; }
                else if (/^\d{4}-\d{2}$/.test(p)) { period_type = 'monthly';   period_value = p; }
                else if (/^\d{4}$/.test(p))   { period_type = 'yearly';    period_value = p; }
                else                           { period_type = 'monthly';   period_value = p; }
            }

            if (!period_type || !period_value) {
                return res.status(400).json({ error: 'Budget period is required (period_type + period_value)' });
            }
            if (!['monthly', 'quarterly', 'yearly'].includes(period_type)) {
                return res.status(400).json({ error: 'period_type must be monthly, quarterly, or yearly' });
            }

            // Verify category belongs to this org
            const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(Number(cat_id), orgId);
            if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

            const now = new Date().toISOString();

            // Check for duplicate (org derived via cat_id)
            const existing = db.prepare(`
                SELECT bud_id FROM budgets b
                JOIN categories c ON b.cat_id = c.cat_id
                WHERE b.cat_id = ? AND b.period_type = ? AND b.period_value = ?
            `).get(Number(cat_id), period_type, period_value.trim());
            if (existing) {
                return res.status(409).json({ error: 'A budget for this category and period already exists.' });
            }

            const legacyPeriod = period_value.trim();
            const result = db.prepare(`
                INSERT INTO budgets (org_id, cat_id, amount, period, period_type, period_value, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(orgId, Number(cat_id), parseFloat(amount), legacyPeriod, period_type, period_value.trim(), now);

            const bud_id = Number(result.lastInsertRowid);
            return res.status(200).json({
                id: bud_id,
                bud_id,
                org_id: orgId,
                cat_id: Number(cat_id),
                amount: parseFloat(amount),
                period_type,
                period_value: period_value.trim(),
                createdAt: now
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            const { cat_id, amount } = req.body;
            let { period_type, period_value, period } = req.body;

            // Resolve period_type + period_value from legacy period if needed
            if (period && (!period_type || !period_value)) {
                const p = String(period).trim();
                if (/^\d{4}-Q\d$/.test(p))   { period_type = 'quarterly'; period_value = p; }
                else if (/^\d{4}-\d{2}$/.test(p)) { period_type = 'monthly';   period_value = p; }
                else if (/^\d{4}$/.test(p))   { period_type = 'yearly';    period_value = p; }
                else                           { period_type = 'monthly';   period_value = p; }
            }

            // Verify ownership via category's org
            const bud = db.prepare(`
                SELECT b.bud_id FROM budgets b
                JOIN categories c ON b.cat_id = c.cat_id
                WHERE b.bud_id = ? AND c.org_id = ?
            `).get(numId, orgId);
            if (!bud) return res.status(403).json({ error: 'Budget not found for your organisation.' });

            const now = new Date().toISOString();
            const legacyPeriod = period_value ? period_value.trim() : null;
            db.prepare(`
                UPDATE budgets
                SET cat_id = ?, amount = ?, period = COALESCE(?, period), period_type = ?, period_value = ?, updatedAt = ?
                WHERE bud_id = ?
            `).run(Number(cat_id), parseFloat(amount), legacyPeriod, period_type, legacyPeriod, now, numId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify ownership via category's org
            const bud = db.prepare(`
                SELECT b.bud_id FROM budgets b
                JOIN categories c ON b.cat_id = c.cat_id
                WHERE b.bud_id = ? AND c.org_id = ?
            `).get(numId, orgId);
            if (!bud) return res.status(403).json({ error: 'Budget not found for your organisation.' });

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
