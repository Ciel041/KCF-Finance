import { getDb } from './mongodb.js';

/**
 * Resolves a budget period string into start/end date strings.
 * Supports:
 *   - Monthly:    "2026-10"   → '2026-10-01' to '2026-10-31'
 *   - Quarterly:  "2026-Q1"   → '2026-01-01' to '2026-03-31'
 *   - Yearly:     "2026"      → '2026-01-01' to '2026-12-31'
 */
export function getDateRangeForPeriod(period) {
    if (!period) return { start: '1970-01-01', end: '2099-12-31' };

    // Quarterly: "2026-Q1", "2026-Q2", etc.
    const quarterMatch = String(period).match(/^(\d{4})-Q(\d)$/);
    if (quarterMatch) {
        const year = quarterMatch[1];
        const q = parseInt(quarterMatch[2], 10);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const endDay = new Date(parseInt(year, 10), endMonth, 0).getDate();
        return {
            start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
        };
    }

    // Monthly: "2026-10"
    const monthMatch = String(period).match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
        const year = monthMatch[1];
        const month = monthMatch[2];
        const endDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        return {
            start: `${year}-${month}-01`,
            end: `${year}-${month}-${String(endDay).padStart(2, '0')}`
        };
    }

    // Yearly: "2026"
    const yearMatch = String(period).match(/^(\d{4})$/);
    if (yearMatch) {
        return {
            start: `${period}-01-01`,
            end: `${period}-12-31`
        };
    }

    // Fallback: treat as monthly prefix (legacy data)
    return { start: `${period}-01`, end: `${period}-31` };
}

/**
 * Budget Enforcement — check ALL applicable budgets BEFORE allowing an expense in MongoDB.
 */
export async function checkBudgetBeforeExpense(org_id, cat_id, e_date, newAmount) {
    try {
        const db = await getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        const allBudgets = await db.collection('budgets').find({
            org_id: numOrgId,
            cat_id: numCatId
        }).toArray();

        if (allBudgets.length === 0) {
            return { blocked: false };
        }

        for (const budget of allBudgets) {
            const range = getDateRangeForPeriod(budget.period);

            if (e_date < range.start || e_date > range.end) {
                continue;
            }

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
                        total: { $sum: '$amount' }
                    }
                }
            ]).toArray();

            const alreadySpent = expAgg.length > 0 ? Number(expAgg[0].total) : 0;
            const remaining = Number(budget.amount) - alreadySpent;

            if (alreadySpent + newAmount > Number(budget.amount)) {
                return {
                    blocked: true,
                    message: `This expense of $${newAmount.toFixed(2)} would exceed the ${budget.period} budget. You have $${remaining.toFixed(2)} remaining out of $${Number(budget.amount).toFixed(2)} allocated.`,
                    budgetAmount: Number(budget.amount),
                    alreadySpent,
                    remaining
                };
            }

            const newTotal = alreadySpent + newAmount;
            if (newTotal / Number(budget.amount) > 0.75) {
                return {
                    blocked: false,
                    warning: `Heads up: After this expense you'll have used ${((newTotal / Number(budget.amount)) * 100).toFixed(0)}% of your ${budget.period} budget ($${(Number(budget.amount) - newTotal).toFixed(2)} remaining).`
                };
            }
        }

        return { blocked: false };
    } catch (err) {
        console.error('Error checking budget in MongoDB:', err);
        return { blocked: false };
    }
}
