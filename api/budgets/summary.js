import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { org_id, cat_id, period } = req.query;

    if (!org_id || !cat_id) {
        return res.status(400).json({ error: 'Missing required parameters: org_id, cat_id' });
    }

    try {
        const db = getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        let sql = 'SELECT * FROM budgets WHERE org_id = ? AND cat_id = ?';
        let budgets;
        if (period) {
            sql += ' AND period = ? ORDER BY period DESC, bud_id DESC';
            budgets = db.prepare(sql).all(numOrgId, numCatId, String(period).trim());
        } else {
            sql += ' ORDER BY period DESC, bud_id DESC';
            budgets = db.prepare(sql).all(numOrgId, numCatId);
        }

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const results = budgets.map(budget => {
            const range = getDateRangeForPeriod(budget.period);
            const expRow = expStmt.get(numOrgId, numCatId, range.start, range.end);
            const actual_spent = expRow ? Number(expRow.total_spent) : 0;
            return {
                bud_id: budget.bud_id,
                period: budget.period,
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
