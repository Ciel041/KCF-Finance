/**
 * Admin API — /api/admin/*
 * All endpoints require an active super-admin session.
 * Super Admin credentials are provisioned via create-admin.js script;
 * they are NEVER settable through public registration.
 *
 * Admin Permissions:
 *   CAN: View organisations, view financial records (read-only), view audit logs,
 *        soft-delete organisations, view suspicious activity reports.
 *   CANNOT: Create/edit/delete expenses or income, bypass validation or audit logging.
 */

import bcrypt from 'bcrypt';
import { getDb } from '../lib/sqlite.js';
import { requireAdmin } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
    const { method } = req;
    const url = req.url || '';
    const parts = url.split('/').filter(Boolean);
    // parts example: ['api', 'admin', 'login'] or ['api', 'admin', 'organisations', '5']
    const action = parts[parts.length - 1]?.split('?')[0];
    const penultimate = parts[parts.length - 2]?.split('?')[0];

    try {
        // ── Admin Login (public — no session required) ───────────────────────
        if (method === 'POST' && action === 'login') {
            return await handleAdminLogin(req, res);
        }
        if (method === 'POST' && action === 'logout') {
            return handleAdminLogout(req, res);
        }
        if (method === 'GET' && action === 'me') {
            return handleAdminMe(req, res);
        }

        // ── All other admin routes require admin session ──────────────────────
        if (!req.session || !req.session.isAdmin) {
            return res.status(403).json({ error: 'Admin access required.' });
        }

        // GET /api/admin/organisations
        if (method === 'GET' && action === 'organisations') {
            return handleListOrgs(req, res);
        }

        // GET /api/admin/organisations/:id  — org details
        if (method === 'GET' && penultimate === 'organisations') {
            const orgId = Number(action);
            if (!orgId) return res.status(400).json({ error: 'Invalid organisation ID.' });
            return handleOrgDetail(req, res, orgId);
        }

        // GET /api/admin/expenses/:orgId  — read-only expense list for org
        if (method === 'GET' && penultimate === 'expenses') {
            const orgId = Number(action);
            if (!orgId) return res.status(400).json({ error: 'Invalid organisation ID.' });
            return handleAdminGetExpenses(req, res, orgId);
        }

        // GET /api/admin/audit-log  — all audit logs (optionally filtered by orgId query param)
        if (method === 'GET' && action === 'audit-log') {
            return handleAuditLog(req, res);
        }

        // GET /api/admin/suspicious  — suspicious activity report
        if (method === 'GET' && action === 'suspicious') {
            return handleSuspicious(req, res);
        }

        // DELETE /api/admin/organisations/:id  — soft-delete org
        if (method === 'DELETE' && penultimate === 'organisations') {
            const orgId = Number(action);
            if (!orgId) return res.status(400).json({ error: 'Invalid organisation ID.' });
            return handleSoftDeleteOrg(req, res, orgId);
        }

        // Block admins from POST/PUT on financial endpoints — explicit guard
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            return res.status(403).json({
                error: 'Admins have read-only access. Financial records can only be modified by organisation users.'
            });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ error: `Admin route not found: ${method} ${url}` });
    } catch (err) {
        console.error('Admin API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin Login ───────────────────────────────────────────────────────────────

async function handleAdminLogin(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.trim().toLowerCase());

    if (!admin) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Session error.' });
        req.session.isAdmin = true;
        req.session.adminEmail = admin.email;
        return res.status(200).json({ message: 'Admin login successful.', email: admin.email });
    });
}

// ── Admin Logout ──────────────────────────────────────────────────────────────

function handleAdminLogout(req, res) {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed.' });
        res.clearCookie('kcf.sid');
        return res.status(200).json({ message: 'Admin logged out.' });
    });
}

// ── Admin Session Check ───────────────────────────────────────────────────────

function handleAdminMe(req, res) {
    if (!req.session || !req.session.isAdmin) {
        return res.status(401).json({ authenticated: false });
    }
    return res.status(200).json({ authenticated: true, email: req.session.adminEmail });
}

// ── List All Organisations (including soft-deleted) ───────────────────────────

function handleListOrgs(req, res) {
    const db = getDb();
    const includeDeleted = req.query.include_deleted === '1';

    const orgs = db.prepare(`
        SELECT
            o.org_id,
            o.name,
            o.type,
            o.address,
            COALESCE(o.contact, o.Contact, '') AS contact,
            o.createdAt,
            o.is_deleted,
            o.deleted_at,
            a.email,
            (SELECT COUNT(*) FROM expenses  WHERE org_id = o.org_id) AS expense_count,
            (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE org_id = o.org_id) AS total_expenses,
            (SELECT COUNT(*) FROM income    WHERE org_id = o.org_id) AS income_count,
            (SELECT COALESCE(SUM(amount),0) FROM income   WHERE org_id = o.org_id) AS total_income,
            (SELECT COUNT(*) FROM budgets   WHERE org_id = o.org_id) AS budget_count,
            (SELECT COUNT(*) FROM expense_audit_history eah WHERE eah.org_id = o.org_id AND eah.is_suspicious = 1) AS suspicious_count
        FROM organisations o
        LEFT JOIN org_accounts a ON a.org_id = o.org_id
        ${includeDeleted ? '' : 'WHERE o.is_deleted = 0'}
        ORDER BY o.createdAt DESC
    `).all();
    return res.status(200).json(orgs);
}

// ── Organisation Detail ───────────────────────────────────────────────────────

function handleOrgDetail(req, res, orgId) {
    const db = getDb();

    const org = db.prepare(`
        SELECT o.*, a.email,
            (SELECT COUNT(*) FROM expenses  WHERE org_id = o.org_id) AS expense_count,
            (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE org_id = o.org_id) AS total_expenses,
            (SELECT COUNT(*) FROM income    WHERE org_id = o.org_id) AS income_count,
            (SELECT COALESCE(SUM(amount),0) FROM income   WHERE org_id = o.org_id) AS total_income,
            (SELECT COUNT(*) FROM categories WHERE org_id = o.org_id) AS category_count,
            (SELECT COUNT(*) FROM budgets   WHERE org_id = o.org_id) AS budget_count
        FROM organisations o
        LEFT JOIN org_accounts a ON a.org_id = o.org_id
        WHERE o.org_id = ?
    `).get(orgId);
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    return res.status(200).json(org);
}

// ── Admin Get Expenses for Org (read-only) ───────────────────────────────────

function handleAdminGetExpenses(req, res, orgId) {
    const db = getDb();

    // Verify org exists
    const org = db.prepare('SELECT name FROM organisations WHERE org_id = ?').get(orgId);
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    const expenses = db.prepare(`
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
            COALESCE(c.cat_name, '') AS cat_name,
            (SELECT COUNT(*) FROM expense_audit_history WHERE exp_id = e.exp_id AND is_suspicious = 1) AS suspicious_edit_count
        FROM expenses e
        LEFT JOIN categories c ON e.cat_id = c.cat_id
        WHERE e.org_id = ?
        ORDER BY e.e_date DESC, e.exp_id DESC
    `).all(orgId);

    // Also get audit history for each expense
    return res.status(200).json({ org_name: org.name, expenses });
}

// ── Audit Log (all entries or filtered by orgId) ──────────────────────────────

function handleAuditLog(req, res) {
    const db = getDb();
    const orgId = req.query.org_id ? Number(req.query.org_id) : null;
    const onlySuspicious = req.query.suspicious === '1';
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    let where = [];
    if (orgId) where.push(`target_org_id = ${orgId}`);
    if (onlySuspicious) where.push('is_suspicious = 1');
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const logs = db.prepare(`
        SELECT * FROM audit_log
        ${whereStr}
        ORDER BY performed_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${whereStr}`).get();

    return res.status(200).json({ logs, total: totalRow.count, limit, offset });
}

// ── Suspicious Activity Report ────────────────────────────────────────────────

function handleSuspicious(req, res) {
    const db = getDb();

    const suspiciousEdits = db.prepare(`
        SELECT
            eah.history_id,
            eah.exp_id,
            eah.org_id,
            o.name AS org_name,
            eah.action,
            eah.changed_by,
            eah.changed_at,
            eah.change_reason,
            eah.suspicious_reason,
            eah.old_values,
            eah.new_values
        FROM expense_audit_history eah
        LEFT JOIN organisations o ON eah.org_id = o.org_id
        WHERE eah.is_suspicious = 1
        ORDER BY eah.changed_at DESC
        LIMIT 200
    `).all();

    const suspiciousCount = db.prepare('SELECT COUNT(*) as count FROM expense_audit_history WHERE is_suspicious = 1').get();
    const affectedOrgs = db.prepare('SELECT DISTINCT org_id FROM expense_audit_history WHERE is_suspicious = 1').all();

    return res.status(200).json({
        total_suspicious: suspiciousCount.count,
        affected_org_count: affectedOrgs.length,
        records: suspiciousEdits
    });
}

// ── Soft-Delete Organisation ──────────────────────────────────────────────────

function handleSoftDeleteOrg(req, res, orgId) {
    const db = getDb();

    // Verify org exists and is not already deleted
    const org = db.prepare('SELECT name, is_deleted FROM organisations WHERE org_id = ?').get(orgId);
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });
    if (org.is_deleted) return res.status(409).json({ error: 'Organisation is already deleted.' });

    const now = new Date().toISOString();

    db.prepare('BEGIN').run();
    try {
        // Soft-delete: mark as deleted but preserve all financial records for audit
        db.prepare(`
            UPDATE organisations
            SET is_deleted = 1, deleted_at = ?
            WHERE org_id = ?
        `).run(now, orgId);

        // Disable login by removing org_accounts entry
        // (but we keep it in audit_log so history is intact)
        db.prepare('DELETE FROM org_accounts WHERE org_id = ?').run(orgId);

        // Audit log
        db.prepare(`
            INSERT INTO audit_log (action, target_org_id, performed_by, performed_at, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            'SOFT_DELETE_ORGANISATION',
            orgId,
            req.session.adminEmail || 'admin',
            now,
            JSON.stringify({ org_name: org.name, note: 'Organisation soft-deleted. Financial records preserved.' })
        );

        db.prepare('COMMIT').run();
    } catch (err) {
        db.prepare('ROLLBACK').run();
        throw err;
    }

    return res.status(200).json({
        message: `Organisation "${org.name}" has been deactivated. Financial records have been preserved for audit. The organisation's login has been disabled.`,
        org_id: orgId,
        deleted_at: now
    });
}
