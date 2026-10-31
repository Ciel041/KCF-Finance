import { getDb } from '../../lib/sqlite.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { org_id } = req.query;

    if (!org_id) {
        return res.status(400).json({ error: 'Missing required parameter: org_id' });
    }

    try {
        const db = getDb();
        const numOrgId = Number(org_id);

        const incRow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM income
            WHERE org_id = ?
        `).get(numOrgId);

        const expRow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE org_id = ?
        `).get(numOrgId);

        const expensesByCategory = db.prepare(`
            SELECT 
                e.cat_id,
                COALESCE(c.cat_name, 'Uncategorized') AS cat_name,
                SUM(e.amount) AS amount
            FROM expenses e
            LEFT JOIN categories c ON e.cat_id = c.cat_id
            WHERE e.org_id = ?
            GROUP BY e.cat_id
        `).all(numOrgId);

        return res.status(200).json({
            totalIncome: incRow ? Number(incRow.total) : 0,
            totalExpense: expRow ? Number(expRow.total) : 0,
            expensesByCategory: expensesByCategory.map(row => ({
                cat_id: row.cat_id,
                cat_name: row.cat_name,
                amount: Number(row.amount)
            }))
        });
    } catch (err) {
        console.error('API Error in dashboard/index:', err);
        return res.status(500).json({ error: err.message });
    }
}
