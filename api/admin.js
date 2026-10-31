/**
 * Admin API — /api/admin/*
 * All endpoints require an active super-admin session.
 * Super Admin credentials are provisioned via create-admin.js script;
 * they are NEVER settable through public registration.
 */

import bcrypt from 'bcrypt';
import { getDb } from '../lib/sqlite.js';
import { requireAdmin } from '../lib/auth-middleware.js';

const SALT_ROUNDS = 12;

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

        // DELETE /api/admin/organisations/:id
        if (method === 'DELETE' && penultimate === 'organisations') {
            const orgId = Number(action);
            if (!orgId) return res.status(400).json({ error: 'Invalid organisation ID.' });
            return handleDeleteOrg(req, res, orgId);
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

// ── List All Organisations ────────────────────────────────────────────────────

function handleListOrgs(req, res) {
    const db = getDb();
    const orgs = db.prepare(`
        SELECT 
            o.org_id,
            o.name,
            o.type,
            o.address,
            o.Contact,
            o.createdAt,
            a.email,
            (SELECT COUNT(*) FROM expenses  WHERE org_id = o.org_id) AS expense_count,
            (SELECT COUNT(*) FROM income    WHERE org_id = o.org_id) AS income_count,
            (SELECT COUNT(*) FROM budgets   WHERE org_id = o.org_id) AS budget_count
        FROM organisations o
        LEFT JOIN org_accounts a ON a.org_id = o.org_id
        ORDER BY o.createdAt DESC
    `).all();
    return res.status(200).json(orgs);
}

// ── Delete Organisation (Admin) ───────────────────────────────────────────────

function handleDeleteOrg(req, res, orgId) {
    const db = getDb();

    // Verify org exists
    const org = db.prepare('SELECT name FROM organisations WHERE org_id = ?').get(orgId);
    if (!org) return res.status(404).json({ error: 'Organisation not found.' });

    const now = new Date().toISOString();

    db.prepare('BEGIN').run();
    try {
        // CASCADE deletes handle child records due to FOREIGN KEY ON DELETE CASCADE,
        // but we log it first and also explicitly clean up for extra safety.
        db.prepare('DELETE FROM expenses      WHERE org_id = ?').run(orgId);
        db.prepare('DELETE FROM income        WHERE org_id = ?').run(orgId);
        db.prepare('DELETE FROM budgets       WHERE org_id = ?').run(orgId);
        db.prepare('DELETE FROM categories    WHERE org_id = ?').run(orgId);
        db.prepare('DELETE FROM org_accounts  WHERE org_id = ?').run(orgId);
        db.prepare('DELETE FROM organisations WHERE org_id = ?').run(orgId);

        // Audit log
        db.prepare(`
            INSERT INTO audit_log (action, target_org_id, performed_by, performed_at, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            'DELETE_ORGANISATION',
            orgId,
            req.session.adminEmail || 'admin',
            now,
            JSON.stringify({ org_name: org.name })
        );

        db.prepare('COMMIT').run();
    } catch (err) {
        db.prepare('ROLLBACK').run();
        throw err;
    }

    return res.status(200).json({ message: `Organisation "${org.name}" has been deleted.` });
}

