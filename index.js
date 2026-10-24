import { getDb } from '../../lib/mongodb.js';

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
        const db = await getDb();
        const numOrgId = Number(org_id);

        const incomeAgg = await db.collection('income').aggregate([
            { $match: { org_id: numOrgId } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();

        const expenseAgg = await db.collection('expenses').aggregate([
            { $match: { org_id: numOrgId } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();

        const expensesByCategory = await db.collection('expenses').aggregate([
            { $match: { org_id: numOrgId } },
            {
                $group: {
                    _id: '$cat_id',
                    amount: { $sum: '$amount' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: 'cat_id',
                    as: 'cat'
                }
            },
            {
                $project: {
                    _id: 0,
                    cat_id: '$_id',
                    cat_name: { $ifNull: [{ $arrayElemAt: ['$cat.cat_name', 0] }, 'Uncategorized'] },
                    amount: 1
                }
            }
        ]).toArray();

        return res.status(200).json({
            totalIncome: incomeAgg.length > 0 ? Number(incomeAgg[0].total) : 0,
            totalExpense: expenseAgg.length > 0 ? Number(expenseAgg[0].total) : 0,
            expensesByCategory
        });
    } catch (err) {
        console.error('API Error in dashboard/index:', err);
        return res.status(500).json({ error: err.message });
    }
}
