/**
 * Budget Summary API — /api/budgets/summary
 * Uses req.orgId from session.
 *
 * 2NF update: uses period_type + period_value columns.
 * Query param: cat_id (required), period_type + period_value (optional filters).
 * Legacy `period` query param still accepted for backwards compat.
 */
import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { cat_id, period_type, period_value, period } = req.query;
    const orgId = req.orgId;

    if (!cat_id) {
        return res.status(400).json({ error: 'Missing required parameter: cat_id' });
    }

    try {
        const db = getDb();
        const numCatId = Number(cat_id);

        // Verify the category belongs to this org
        const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(numCatId, orgId);
        if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

        let budgets;

        if (period_type && period_value) {
            budgets = db.prepare(`
                SELECT * FROM budgets
                WHERE cat_id = ? AND period_type = ? AND period_value = ?
                ORDER BY period_value DESC, bud_id DESC
            `).all(numCatId, period_type, period_value.trim());
        } else if (period) {
            // Legacy: parse single period string
            const p = String(period).trim();
            let pt, pv;
            if (/^\d{4}-Q\d$/.test(p))   { pt = 'quarterly'; pv = p; }
            else if (/^\d{4}-\d{2}$/.test(p)) { pt = 'monthly';   pv = p; }
            else if (/^\d{4}$/.test(p))   { pt = 'yearly';    pv = p; }
            else                           { pt = 'monthly';   pv = p; }
            budgets = db.prepare(`
                SELECT * FROM budgets
                WHERE cat_id = ? AND period_type = ? AND period_value = ?
                ORDER BY period_value DESC, bud_id DESC
            `).all(numCatId, pt, pv);
        } else {
            budgets = db.prepare(`
                SELECT * FROM budgets
                WHERE cat_id = ?
                ORDER BY period_value DESC, bud_id DESC
            `).all(numCatId);
        }

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const results = budgets.map(budget => {
            const range = budget.period_type && budget.period_value
                ? getDateRangeForPeriod(budget.period_type, budget.period_value)
                : getDateRangeForPeriod(budget.period);
            const expRow = expStmt.get(orgId, numCatId, range.start, range.end);
            const actual_spent = expRow ? Number(expRow.total_spent) : 0;
            return {
                bud_id: budget.bud_id,
                period_type: budget.period_type,
                period_value: budget.period_value,
                allocated_budget: Number(budget.amount),
                actual_spent,
                remaining_balance: Number(budget.amount) - actual_spent
            };
        });

        return res.status(200).json(results);
    } catch (err) {
        console.error('API Error in budgets/summary:', err);
        return res.status(500).json({ error: err.message });
    }
}
