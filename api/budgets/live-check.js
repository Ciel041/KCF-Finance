import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { org_id, cat_id, date } = req.query;

    if (!org_id || !cat_id || !date) {
        return res.status(400).json({ error: 'Missing required parameters: org_id, cat_id, date' });
    }

    try {
        const db = getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        const allBudgets = db.prepare(`
            SELECT 
                b.bud_id,
                b.org_id,
                b.cat_id,
                b.amount,
                b.period,
                COALESCE(o.name, '') AS org_name,
                COALESCE(c.cat_name, '') AS cat_name
            FROM budgets b
            LEFT JOIN organisations o ON b.org_id = o.org_id
            LEFT JOIN categories c ON b.cat_id = c.cat_id
            WHERE b.org_id = ? AND b.cat_id = ?
        `).all(numOrgId, numCatId);

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const matches = [];
        for (const budget of allBudgets) {
            const range = getDateRangeForPeriod(budget.period);
            if (date >= range.start && date <= range.end) {
                const expRow = expStmt.get(numOrgId, numCatId, range.start, range.end);
                const spent = expRow ? Number(expRow.total_spent) : 0;
                matches.push({
                    bud_id: budget.bud_id,
                    period: budget.period,
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
