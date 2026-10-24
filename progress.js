import { getDb } from '../../lib/mongodb.js';
import { getDateRangeForPeriod } from '../../lib/budget-helpers.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { org_id } = req.query;

    try {
        const db = await getDb();
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
                    bud_id: 1,
                    org_id: 1,
                    cat_id: 1,
                    budget_amount: '$amount',
                    period: 1,
                    org_name: { $ifNull: [{ $arrayElemAt: ['$org.name', 0] }, ''] },
                    cat_name: { $ifNull: [{ $arrayElemAt: ['$cat.cat_name', 0] }, ''] }
                }
            },
            {
                $sort: { period: -1, bud_id: -1 }
            }
        );

        const budgets = await db.collection('budgets').aggregate(pipeline).toArray();

        // For each budget, calculate actual spent using the correct date range
        const results = await Promise.all(budgets.map(async (budget) => {
            const range = getDateRangeForPeriod(budget.period);
            const expAgg = await db.collection('expenses').aggregate([
                {
                    $match: {
                        org_id: Number(budget.org_id),
                        cat_id: Number(budget.cat_id),
                        e_date: { $gte: range.start, $lte: range.end }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_spent: { $sum: '$amount' }
                    }
                }
            ]).toArray();

            const spent = expAgg.length > 0 ? Number(expAgg[0].total_spent) : 0;
            return {
                ...budget,
                spent,
                remaining: Number(budget.budget_amount) - spent
            };
        }));

        return res.status(200).json(results);
    } catch (err) {
        console.error('API Error in budgets/progress:', err);
        return res.status(500).json({ error: err.message });
    }
}
