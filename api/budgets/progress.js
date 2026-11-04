/**
 * Budget Progress API — /api/budgets/progress
 * Uses req.orgId from session.
 *
 * 2NF update: uses period_type + period_value columns.
 * Derives org via JOIN through categories (no direct org_id dependency).
 */
import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const orgId = req.orgId; // from session

    try {
        const db = getDb();

        const budgets = db.prepare(`
            SELECT
                b.bud_id,
                b.cat_id,
                b.amount AS budget_amount,
                b.period_type,
                b.period_value,
                COALESCE(c.org_id, 0) AS org_id,
                COALESCE(o.name, '')  AS org_name,
                COALESCE(c.cat_name, '') AS cat_name
            FROM budgets b
            JOIN categories c ON b.cat_id = c.cat_id
            LEFT JOIN organisations o ON c.org_id = o.org_id
            WHERE c.org_id = ?
            ORDER BY b.period_value DESC, b.bud_id DESC
        `).all(orgId);

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const results = budgets.map(budget => {
            const range = getDateRangeForPeriod(budget.period_type, budget.period_value);
            const expRow = expStmt.get(Number(budget.org_id), Number(budget.cat_id), range.start, range.end);
            const spent = expRow ? Number(expRow.total_spent) : 0;
            return {
                ...budget,
                spent,
                remaining: Number(budget.budget_amount) - spent
            };
        });

        return res.status(200).json(results);
    } catch (err) {
        console.error('API Error in budgets/progress:', err);
        return res.status(500).json({ error: err.message });
    }
}
