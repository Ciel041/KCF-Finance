import { getDb } from '../../lib/mongodb.js';
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
        const db = await getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        const filter = {
            org_id: numOrgId,
            cat_id: numCatId
        };
        if (period) {
            filter.period = String(period).trim();
        }

        const budgets = await db.collection('budgets')
            .find(filter)
            .sort({ period: -1, bud_id: -1 })
            .toArray();

        const results = await Promise.all(budgets.map(async (budget) => {
            const range = getDateRangeForPeriod(budget.period);
            const expAgg = await db.collection('expenses').aggregate([
                {
                    $match: {
                        org_id: numOrgId,
                        cat_id: numCatId,
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

            const actual_spent = expAgg.length > 0 ? Number(expAgg[0].total_spent) : 0;
            return {
                bud_id: budget.bud_id,
                period: budget.period,
                allocated_budget: Number(budget.amount),
                actual_spent,
                remaining_balance: Number(budget.amount) - actual_spent
            };
        }));

        return res.status(200).json(results);
    } catch (err) {
        console.error('API Error in budgets/summary:', err);
        return res.status(500).json({ error: err.message });
    }
}
