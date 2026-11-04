import { getDb } from './sqlite.js';

/**
 * Resolves a budget period into start/end date strings.
 * Accepts the NEW split format (period_type + period_value) or legacy single string.
 *
 * period_type: 'monthly' | 'quarterly' | 'yearly'
 * period_value: e.g. '2026-10', '2026-Q1', '2026'
 *
 * Also supports the old single `period` string for backwards compatibility.
 */
export function getDateRangeForPeriod(period_type, period_value) {
    // ── Backwards compat: called with a single string (old API) ──────────────
    if (period_value === undefined) {
        // Called as getDateRangeForPeriod(period_string)
        const period = period_type;
        if (!period) return { start: '1970-01-01', end: '2099-12-31' };
        const quarterMatch = String(period).match(/^(\d{4})-Q(\d)$/);
        if (quarterMatch) {
            return _quarterRange(quarterMatch[1], parseInt(quarterMatch[2], 10));
        }
        const monthMatch = String(period).match(/^(\d{4})-(\d{2})$/);
        if (monthMatch) {
            return _monthRange(monthMatch[1], monthMatch[2]);
        }
        const yearMatch = String(period).match(/^(\d{4})$/);
        if (yearMatch) {
            return { start: `${period}-01-01`, end: `${period}-12-31` };
        }
        return { start: `${period}-01`, end: `${period}-31` };
    }

    // ── New split format ──────────────────────────────────────────────────────
    if (!period_type || !period_value) return { start: '1970-01-01', end: '2099-12-31' };

    if (period_type === 'quarterly') {
        const qm = String(period_value).match(/^(\d{4})-Q(\d)$/);
        if (qm) return _quarterRange(qm[1], parseInt(qm[2], 10));
    }

    if (period_type === 'monthly') {
        const mm = String(period_value).match(/^(\d{4})-(\d{2})$/);
        if (mm) return _monthRange(mm[1], mm[2]);
    }

    if (period_type === 'yearly') {
        const ym = String(period_value).match(/^(\d{4})$/);
        if (ym) return { start: `${period_value}-01-01`, end: `${period_value}-12-31` };
    }

    // Fallback: treat as monthly
    const mm = String(period_value).match(/^(\d{4})-(\d{2})$/);
    if (mm) return _monthRange(mm[1], mm[2]);
    return { start: `${period_value}-01`, end: `${period_value}-31` };
}

function _quarterRange(year, q) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(parseInt(year, 10), endMonth, 0).getDate();
    return {
        start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    };
}

function _monthRange(year, month) {
    const endDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
    return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${String(endDay).padStart(2, '0')}`
    };
}

/**
 * Budget Enforcement — check ALL applicable budgets BEFORE allowing an expense in SQLite.
 * Uses period_type + period_value columns (falls back to legacy period string if present).
 */
export async function checkBudgetBeforeExpense(org_id, cat_id, e_date, newAmount) {
    try {
        const db = getDb();
        const numOrgId = Number(org_id);
        const numCatId = Number(cat_id);

        // Fetch budgets for this category (org derived via JOIN)
        const allBudgets = db.prepare(`
            SELECT b.*
            FROM budgets b
            JOIN categories c ON b.cat_id = c.cat_id
            WHERE b.cat_id = ? AND c.org_id = ?
        `).all(numCatId, numOrgId);

        if (!allBudgets || allBudgets.length === 0) {
            return { blocked: false };
        }

        for (const budget of allBudgets) {
            // Use split columns if available, else fall back to legacy period string
            const range = budget.period_type && budget.period_value
                ? getDateRangeForPeriod(budget.period_type, budget.period_value)
                : getDateRangeForPeriod(budget.period);

            if (e_date < range.start || e_date > range.end) {
                continue;
            }

            const expRow = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM expenses
                WHERE org_id = ? AND cat_id = ? AND e_date >= ? AND e_date <= ?
            `).get(numOrgId, numCatId, range.start, range.end);

            const alreadySpent = expRow ? Number(expRow.total) : 0;
            const remaining = Number(budget.amount) - alreadySpent;
            const periodLabel = budget.period_value || budget.period || 'this period';

            if (alreadySpent + newAmount > Number(budget.amount)) {
                return {
                    blocked: true,
                    message: `This expense of ₹${newAmount.toFixed(2)} would exceed the ${periodLabel} budget. You have ₹${remaining.toFixed(2)} remaining out of ₹${Number(budget.amount).toFixed(2)} allocated.`,
                    budgetAmount: Number(budget.amount),
                    alreadySpent,
                    remaining
                };
            }

            const newTotal = alreadySpent + newAmount;
            if (newTotal / Number(budget.amount) > 0.75) {
                return {
                    blocked: false,
                    warning: `Heads up: After this expense you'll have used ${((newTotal / Number(budget.amount)) * 100).toFixed(0)}% of your ${periodLabel} budget (₹${(Number(budget.amount) - newTotal).toFixed(2)} remaining).`
                };
            }
        }

        return { blocked: false };
    } catch (err) {
        console.error('Error checking budget in SQLite:', err);
        return { blocked: false };
    }
}
