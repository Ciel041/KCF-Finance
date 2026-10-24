import { getDb, getNextSequence } from '../lib/mongodb.js';
import { checkBudgetBeforeExpense } from '../lib/budget-helpers.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id, org_id } = req.query;

    try {
        const db = await getDb();

        if (method === 'GET') {
            const pipeline = [];
            if (org_id) {
                pipeline.push({ $match: { org_id: Number(org_id) } });
            }

            pipeline.push(
                {
                    $lookup: {
                        from: 'organisations',
                        localField: 'org_id',
                        foreignField: 'org_id',
                        as: 'org'
                    }
                },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'cat_id',
                        foreignField: 'cat_id',
                        as: 'cat'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        exp_id: 1,
                        org_id: 1,
                        cat_id: 1,
                        amount: 1,
                        e_date: 1,
                        org_name: { $ifNull: [{ $arrayElemAt: ['$org.name', 0] }, ''] },
                        cat_name: { $ifNull: [{ $arrayElemAt: ['$cat.cat_name', 0] }, ''] }
                    }
                },
                {
                    $sort: { e_date: -1, exp_id: -1 }
                }
            );

            const rows = await db.collection('expenses').aggregate(pipeline).toArray();
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

            const exp_id = await getNextSequence('exp_id');
            const doc = {
                exp_id,
                org_id: numOrgId,
                cat_id: numCatId,
                amount: expenseAmount,
                e_date,
                createdAt: new Date()
            };

            await db.collection('expenses').insertOne(doc);
            return res.status(200).json({ id: exp_id, ...doc, warning: budgetCheck.warning || null });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, cat_id, amount, e_date } = req.body;
            const numId = Number(id);

            await db.collection('expenses').updateOne(
                { exp_id: numId },
                {
                    $set: {
                        org_id: Number(bodyOrgId),
                        cat_id: Number(cat_id),
                        amount: parseFloat(amount),
                        e_date,
                        updatedAt: new Date()
                    }
                }
            );
            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            await db.collection('expenses').deleteOne({ exp_id: numId });
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in expenses:', err);
        return res.status(500).json({ error: err.message });
    }
}
