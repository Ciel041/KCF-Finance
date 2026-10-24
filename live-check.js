import { getDb } from '../../lib/mongodb.js';
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
        const db = await getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        const allBudgets = await db.collection('budgets').aggregate([
            {
                $match: {
                    org_id: numOrgId,
                    cat_id: numCatId
                }
            },
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
                    amount: 1,
                    period: 1,
                    org_name: { $ifNull: [{ $arrayElemAt: ['$org.name', 0] }, ''] },
                    cat_name: { $ifNull: [{ $arrayElemAt: ['$cat.cat_name', 0] }, ''] }
                }
            }
        ]).toArray();

        const matches = [];
        for (const budget of allBudgets) {
            const range = getDateRangeForPeriod(budget.period);
            if (date >= range.start && date <= range.end) {
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

                const spent = expAgg.length > 0 ? Number(expAgg[0].total_spent) : 0;
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
