import { getDb } from '../lib/sqlite.js';
import { checkBudgetBeforeExpense } from '../lib/budget-helpers.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id, org_id } = req.query;

    try {
        const db = getDb();

        if (method === 'GET') {
            let sql = `
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
            `;
            let rows;
            if (org_id) {
                sql += ' WHERE e.org_id = ? ORDER BY e.e_date DESC, e.exp_id DESC';
                rows = db.prepare(sql).all(Number(org_id));
            } else {
                sql += ' ORDER BY e.e_date DESC, e.exp_id DESC';
                rows = db.prepare(sql).all();
            }

            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { org_id: bodyOrgId, cat_id, amount, e_date } = req.body;
            if (!bodyOrgId) return res.status(400).json({ error: 'Organisation ID is required' });
            if (!cat_id) return res.status(400).json({ error: 'Category is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive amount is required' });
            }
            if (!e_date) return res.status(400).json({ error: 'Date is required' });

            const expenseAmount = parseFloat(amount);
            const numOrgId = Number(bodyOrgId);
            const numCatId = Number(cat_id);

            // Check budget BEFORE inserting the expense
            const budgetCheck = await checkBudgetBeforeExpense(numOrgId, numCatId, e_date, expenseAmount);

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
            `).run(
                numOrgId,
                numCatId,
                expenseAmount,
                e_date,
                now
            );

            const exp_id = Number(result.lastInsertRowid);
            const doc = {
                id: exp_id,
                exp_id,
                org_id: numOrgId,
                cat_id: numCatId,
                amount: expenseAmount,
                e_date,
                createdAt: now,
                warning: budgetCheck.warning || null
            };

            return res.status(200).json(doc);
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, cat_id, amount, e_date } = req.body;
            const numId = Number(id);
            const now = new Date().toISOString();

            db.prepare(`
                UPDATE expenses
                SET org_id = ?,
                    cat_id = ?,
                    amount = ?,
                    e_date = ?,
                    updatedAt = ?
                WHERE exp_id = ?
            `).run(
                Number(bodyOrgId),
                Number(cat_id),
                parseFloat(amount),
                e_date,
                now,
                numId
            );

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            db.prepare('DELETE FROM expenses WHERE exp_id = ?').run(numId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in expenses:', err);
        return res.status(500).json({ error: err.message });
    }
}
