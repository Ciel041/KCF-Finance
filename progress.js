import { getDb } from '../../lib/sqlite.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { org_id } = req.query;

    try {
        const db = getDb();

        let sql = `
            SELECT 
                b.bud_id,
                b.org_id,
                b.cat_id,
                b.amount AS budget_amount,
                b.period,
                COALESCE(o.name, '') AS org_name,
                COALESCE(c.cat_name, '') AS cat_name
            FROM budgets b
            LEFT JOIN organisations o ON b.org_id = o.org_id
            LEFT JOIN categories c ON b.cat_id = c.cat_id
        `;
        let budgets;
        if (org_id) {
            sql += ' WHERE b.org_id = ? ORDER BY b.period DESC, b.bud_id DESC';
            budgets = db.prepare(sql).all(Number(org_id));
        } else {
            sql += ' ORDER BY b.period DESC, b.bud_id DESC';
            budgets = db.prepare(sql).all();
        }

        const expStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_spent
            FROM expenses
            WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
        `);

        const results = budgets.map(budget => {
            const range = getDateRangeForPeriod(budget.period);
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
