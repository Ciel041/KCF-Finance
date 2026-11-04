/**
 * Budget Live-Check API — /api/budgets/live-check
 * Uses req.orgId from session.
 *
 * 2NF update: uses period_type + period_value columns.
 * Derives org via JOIN through categories.
 */
import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { cat_id, date } = req.query;
    const orgId = req.orgId; // from session

    if (!cat_id || !date) {
        return res.status(400).json({ error: 'Missing required parameters: cat_id, date' });
    }

    try {
        const db = getDb();
        const numCatId = Number(cat_id);

        // Fetch budgets for this category, org derived via JOIN
        const allBudgets = db.prepare(`
            SELECT
                b.bud_id,
                b.cat_id,
                b.amount,
                b.period_type,
                b.period_value,
                COALESCE(c.org_id, 0) AS org_id,
                COALESCE(o.name, '')  AS org_name,
                COALESCE(c.cat_name, '') AS cat_name
            FROM budgets b
            JOIN categories c ON b.cat_id = c.cat_id
            LEFT JOIN organisations o ON c.org_id = o.org_id
            WHERE b.cat_id = ? AND c.org_id = ?
        `).all(numCatId, orgId);

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const matches = [];
        for (const budget of allBudgets) {
            const range = budget.period_type && budget.period_value
                ? getDateRangeForPeriod(budget.period_type, budget.period_value)
                : getDateRangeForPeriod(budget.period);

            if (date >= range.start && date <= range.end) {
                const expRow = expStmt.get(orgId, numCatId, range.start, range.end);
                const spent = expRow ? Number(expRow.total_spent) : 0;
                matches.push({
                    bud_id: budget.bud_id,
                    period_type: budget.period_type,
                    period_value: budget.period_value,
                    budget_amount: Number(budget.amount),
                    spent,
                    remaining: Number(budget.amount) - spent,
                    cat_name: budget.cat_name,
                    org_name: budget.org_name,
                    range_start: range.start,
                    range_end: range.end
                });
            }
        }

        return res.status(200).json({ hasBudget: matches.length > 0, budgets: matches });
    } catch (err) {
        console.error('API Error in budgets/live-check:', err);
        return res.status(500).json({ error: err.message });
    }
}
