/**
 * Expenses API — /api/expenses
 * org_id is taken from req.orgId (set by requireAuth middleware from session).
 * Client-supplied org_id values in body/query are IGNORED for security.
 *
 * Features:
 *  - Server-side createdAt / updatedAt timestamps
 *  - Immutable createdAt (never overwritten on edit)
 *  - Audit history logged to expense_audit_history
 *  - Mandatory "reason" field for edits
 *  - Suspicious activity flagging (> 3 edits, or editing old records)
 *  - Admins blocked from creating/editing expenses via this endpoint
 */
import { getDb } from '../lib/sqlite.js';
import { checkBudgetBeforeExpense } from '../lib/budget-helpers.js';

// How many days back an expense is considered "old" (suspicious if edited)
const SUSPICIOUS_EDIT_DAYS = 30;
// How many edits before flagging as suspicious
const SUSPICIOUS_EDIT_COUNT = 3;

export default async function handler(req, res) {
    const { method } = req;
    const { id, history } = req.query;
    // SECURITY: Always use the session org, never trust client
    const orgId = req.orgId;

    // Block admins from creating/editing/deleting expenses
    if (req.session && req.session.isAdmin) {
        return res.status(403).json({ error: 'Admins have read-only access to financial records. Use /api/admin/expenses/:orgId to view.' });
    }

    try {
        const db = getDb();

        // ── GET ──────────────────────────────────────────────────────────────

        if (method === 'GET') {
            // Single expense with audit history: GET /api/expenses?id=X&history=1
            if (id && history) {
                const numId = Number(id);
                const exp = db.prepare(`
                    SELECT e.exp_id, e.org_id, e.cat_id, e.amount, e.e_date,
                           e.description, e.createdAt, e.updatedAt, e.edit_count,
                           COALESCE(c.cat_name, '') AS cat_name
                    FROM expenses e
                    LEFT JOIN categories c ON e.cat_id = c.cat_id
                    WHERE e.exp_id = ? AND e.org_id = ?
                `).get(numId, orgId);
                if (!exp) return res.status(404).json({ error: 'Expense not found.' });

                const auditRows = db.prepare(`
                    SELECT history_id, action, changed_by, changed_at,
                           old_values, new_values, change_reason,
                           is_suspicious, suspicious_reason
                    FROM expense_audit_history
                    WHERE exp_id = ?
                    ORDER BY changed_at ASC
                `).all(numId);

                return res.status(200).json({ expense: exp, history: auditRows });
            }

            // List all expenses for org
            const sql = `
                SELECT
                    e.exp_id,
                    e.org_id,
                    e.cat_id,
                    e.amount,
                    e.e_date,
                    e.description,
                    e.createdAt,
                    e.updatedAt,
                    e.edit_count,
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

        // ── POST (Create) ────────────────────────────────────────────────────

        if (method === 'POST') {
            const { cat_id, amount, e_date, description } = req.body;
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
            const changedBy = req.session.email || `org:${orgId}`;

            let newId;
            db.prepare('BEGIN').run();
            try {
                const result = db.prepare(`
                    INSERT INTO expenses (org_id, cat_id, amount, e_date, description, createdAt, edit_count)
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                `).run(orgId, numCatId, expenseAmount, e_date, (description || '').trim(), now);
                newId = Number(result.lastInsertRowid);

                // Audit: record creation
                db.prepare(`
                    INSERT INTO expense_audit_history
                        (exp_id, org_id, action, changed_by, changed_at, old_values, new_values, change_reason)
                    VALUES (?, ?, 'CREATE', ?, ?, NULL, ?, 'Initial creation')
                `).run(
                    newId, orgId, changedBy, now,
                    JSON.stringify({ cat_id: numCatId, amount: expenseAmount, e_date, description: (description || '').trim() })
                );

                db.prepare('COMMIT').run();
            } catch (err) {
                db.prepare('ROLLBACK').run();
                throw err;
            }

            return res.status(200).json({
                id: newId,
                exp_id: newId,
                org_id: orgId,
                cat_id: numCatId,
                amount: expenseAmount,
                e_date,
                description: (description || '').trim(),
                createdAt: now,
                updatedAt: null,
                edit_count: 0,
                warning: budgetCheck.warning || null
            });
        }

        // ── PUT (Edit) ───────────────────────────────────────────────────────

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { cat_id, amount, e_date, description, reason } = req.body;
            const numId = Number(id);

            // Reason is mandatory for edits
            if (!reason || !reason.trim()) {
                return res.status(400).json({ error: 'A reason for editing this expense is required.' });
            }

            // Validate fields
            if (amount !== undefined && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
                return res.status(400).json({ error: 'A valid positive amount is required.' });
            }

            // Verify the expense belongs to this org
            const exp = db.prepare(`
                SELECT exp_id, org_id, cat_id, amount, e_date, description, createdAt, edit_count
                FROM expenses WHERE exp_id = ? AND org_id = ?
            `).get(numId, orgId);
            if (!exp) return res.status(403).json({ error: 'Expense not found for your organisation.' });

            const now = new Date().toISOString();
            const changedBy = req.session.email || `org:${orgId}`;
            const newEditCount = (exp.edit_count || 0) + 1;

            // Detect suspicious activity
            let isSuspicious = 0;
            let suspiciousReason = null;
            const suspiciousReasons = [];

            if (newEditCount > SUSPICIOUS_EDIT_COUNT) {
                suspiciousReasons.push(`Edited ${newEditCount} times (threshold: ${SUSPICIOUS_EDIT_COUNT})`);
            }
            const expDate = new Date(exp.e_date);
            const ageMs = Date.now() - expDate.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            if (ageDays > SUSPICIOUS_EDIT_DAYS) {
                suspiciousReasons.push(`Editing expense dated ${exp.e_date} (${Math.floor(ageDays)} days ago, threshold: ${SUSPICIOUS_EDIT_DAYS} days)`);
            }
            if (suspiciousReasons.length > 0) {
                isSuspicious = 1;
                suspiciousReason = suspiciousReasons.join('; ');
            }

            const oldValues = {
                cat_id: exp.cat_id,
                amount: exp.amount,
                e_date: exp.e_date,
                description: exp.description
            };
            const newValues = {
                cat_id: cat_id !== undefined ? Number(cat_id) : exp.cat_id,
                amount: amount !== undefined ? parseFloat(amount) : exp.amount,
                e_date: e_date !== undefined ? e_date : exp.e_date,
                description: description !== undefined ? description.trim() : exp.description
            };

            // If cat_id is changing, verify it belongs to this org
            if (cat_id && Number(cat_id) !== exp.cat_id) {
                const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(Number(cat_id), orgId);
                if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });
            }

            db.prepare('BEGIN').run();
            try {
                db.prepare(`
                    UPDATE expenses
                    SET cat_id = ?, amount = ?, e_date = ?, description = ?, updatedAt = ?, edit_count = ?
                    WHERE exp_id = ? AND org_id = ?
                `).run(newValues.cat_id, newValues.amount, newValues.e_date, newValues.description,
                       now, newEditCount, numId, orgId);

                // Audit history — immutable record
                db.prepare(`
                    INSERT INTO expense_audit_history
                        (exp_id, org_id, action, changed_by, changed_at, old_values, new_values, change_reason, is_suspicious, suspicious_reason)
                    VALUES (?, ?, 'EDIT', ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    numId, orgId, changedBy, now,
                    JSON.stringify(oldValues),
                    JSON.stringify(newValues),
                    reason.trim(),
                    isSuspicious,
                    suspiciousReason
                );

                // Also log to central audit_log if suspicious
                if (isSuspicious) {
                    db.prepare(`
                        INSERT INTO audit_log
                            (action, target_org_id, performed_by, performed_at, details, old_values, new_values, change_reason, is_suspicious, suspicious_reason)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        'SUSPICIOUS_EXPENSE_EDIT',
                        orgId,
                        changedBy,
                        now,
                        JSON.stringify({ exp_id: numId, edit_count: newEditCount }),
                        JSON.stringify(oldValues),
                        JSON.stringify(newValues),
                        reason.trim(),
                        1,
                        suspiciousReason
                    );
                }

                db.prepare('COMMIT').run();
            } catch (err) {
                db.prepare('ROLLBACK').run();
                throw err;
            }

            return res.status(200).json({
                message: 'Updated successfully',
                updatedAt: now,
                edit_count: newEditCount,
                is_suspicious: isSuspicious,
                suspicious_reason: suspiciousReason
            });
        }

        // ── DELETE ───────────────────────────────────────────────────────────

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify the expense belongs to this org
            const exp = db.prepare('SELECT exp_id, cat_id, amount, e_date, description FROM expenses WHERE exp_id = ? AND org_id = ?').get(numId, orgId);
            if (!exp) return res.status(403).json({ error: 'Expense not found for your organisation.' });

            const now = new Date().toISOString();
            const changedBy = req.session.email || `org:${orgId}`;

            db.prepare('BEGIN').run();
            try {
                // Audit before delete (history records cascade-delete with expense, so log to audit_log)
                db.prepare(`
                    INSERT INTO audit_log
                        (action, target_org_id, performed_by, performed_at, details, old_values)
                    VALUES ('DELETE_EXPENSE', ?, ?, ?, ?, ?)
                `).run(
                    orgId, changedBy, now,
                    JSON.stringify({ exp_id: numId }),
                    JSON.stringify({ cat_id: exp.cat_id, amount: exp.amount, e_date: exp.e_date, description: exp.description })
                );

                db.prepare('DELETE FROM expenses WHERE exp_id = ? AND org_id = ?').run(numId, orgId);
                db.prepare('COMMIT').run();
            } catch (err) {
                db.prepare('ROLLBACK').run();
                throw err;
            }

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in expenses:', err);
        return res.status(500).json({ error: err.message });
    }
}
