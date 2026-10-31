/**
 * Expenses API — /api/expenses
 * org_id is taken from req.orgId (set by requireAuth middleware from session).
 * Client-supplied org_id values in body/query are IGNORED for security.
 */
import { getDb } from '../lib/sqlite.js';
import { checkBudgetBeforeExpense } from '../lib/budget-helpers.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    // SECURITY: Always use the session org, never trust client
    const orgId = req.orgId;

    try {
        const db = getDb();

        if (method === 'GET') {
            const sql = `
                SELECT 
                    e.exp_id,
                    e.org_id,
                    e.cat_id,
                    e.amount,
                    e.e_date,
                    COALESCE(o.name, '') AS org_name,
                    COALESCE(c.cat_name, '') AS cat_name
                FROM expenses e
                LEFT JOIN organisations o ON e.org_id = o.org_id
                LEFT JOIN categories c ON e.cat_id = c.cat_id
                WHERE e.org_id = ?
                ORDER BY e.e_date DESC, e.exp_id DESC
            `;
            const rows = db.prepare(sql).all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { cat_id, amount, e_date } = req.body;
            if (!cat_id) return res.status(400).json({ error: 'Category is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive amount is required' });
            }
            if (!e_date) return res.status(400).json({ error: 'Date is required' });

            const expenseAmount = parseFloat(amount);
            const numCatId = Number(cat_id);

            // Verify the category belongs to this org
            const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(numCatId, orgId);
            if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

            // Check budget BEFORE inserting
            const budgetCheck = await checkBudgetBeforeExpense(orgId, numCatId, e_date, expenseAmount);

            if (budgetCheck.blocked) {
                return res.status(400).json({
                    blocked: true,
                    message: budgetCheck.message,
                    budgetAmount: budgetCheck.budgetAmount,
                    alreadySpent: budgetCheck.alreadySpent,
                    remaining: budgetCheck.remaining,
                    attempted: expenseAmount
                });
            }

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO expenses (org_id, cat_id, amount, e_date, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `).run(orgId, numCatId, expenseAmount, e_date, now);

            return res.status(200).json({
                id: Number(result.lastInsertRowid),
                exp_id: Number(result.lastInsertRowid),
                org_id: orgId,
                cat_id: numCatId,
                amount: expenseAmount,
                e_date,
                createdAt: now,
                warning: budgetCheck.warning || null
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { cat_id, amount, e_date } = req.body;
            const numId = Number(id);

            // Verify the expense belongs to this org
            const exp = db.prepare('SELECT exp_id FROM expenses WHERE exp_id = ? AND org_id = ?').get(numId, orgId);
            if (!exp) return res.status(403).json({ error: 'Expense not found for your organisation.' });

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE expenses
                SET cat_id = ?, amount = ?, e_date = ?, updatedAt = ?
                WHERE exp_id = ? AND org_id = ?
            `).run(Number(cat_id), parseFloat(amount), e_date, now, numId, orgId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify the expense belongs to this org
            const exp = db.prepare('SELECT exp_id FROM expenses WHERE exp_id = ? AND org_id = ?').get(numId, orgId);
            if (!exp) return res.status(403).json({ error: 'Expense not found for your organisation.' });

            db.prepare('DELETE FROM expenses WHERE exp_id = ? AND org_id = ?').run(numId, orgId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in expenses:', err);
        return res.status(500).json({ error: err.message });
    }
}
