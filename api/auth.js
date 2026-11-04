/**
 * Auth API — /api/auth/*
 * Handles organisation registration, login, logout, and session check.
 * Password hashing uses bcrypt. Org ID for all subsequent requests comes from
 * the server-side session (never trusted from the client body/query).
 */

import bcrypt from 'bcrypt';
import { getDb } from '../lib/sqlite.js';

const SALT_ROUNDS = 12;

export default async function handler(req, res) {
    const { method } = req;

    // Parse sub-route from URL e.g. /api/auth/register → action = 'register'
    const url = req.url || '';
    const action = url.split('/').filter(Boolean).pop().split('?')[0];

    try {
        if (method === 'POST' && action === 'register') {
            return await handleRegister(req, res);
        }
        if (method === 'POST' && action === 'login') {
            return await handleLogin(req, res);
        }
        if (method === 'POST' && action === 'logout') {
            return await handleLogout(req, res);
        }
        if (method === 'GET' && action === 'me') {
            return handleMe(req, res);
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: `Method ${method} not allowed on /api/auth/${action}` });
    } catch (err) {
        console.error('Auth API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Register ──────────────────────────────────────────────────────────────────

async function handleRegister(req, res) {
    const { name, type, address, contact, email, password, confirmPassword } = req.body || {};

    // Validation
    const errors = [];
    if (!name || !name.trim()) errors.push('Organisation name is required.');
    if (!email || !email.trim()) errors.push('Email address is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())) errors.push('A valid email address is required.');
    if (!password) errors.push('Password is required.');
    if (password && password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== confirmPassword) errors.push('Passwords do not match.');
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' ') });

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate email
    const existing = db.prepare('SELECT account_id FROM org_accounts WHERE email = ?').get(normalizedEmail);
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();

    // Create organisation row first, then account row (transaction)
    const insertOrg = db.prepare(`
        INSERT INTO organisations (name, type, address, Contact, createdAt)
        VALUES (?, ?, ?, ?, ?)
    `);
    const insertAccount = db.prepare(`
        INSERT INTO org_accounts (org_id, email, password_hash, createdAt)
        VALUES (?, ?, ?, ?)
    `);

    let orgId;
    db.prepare('BEGIN').run();
    try {
        const orgResult = insertOrg.run(
            name.trim(),
            type || 'Standard',
            (address || '').trim(),
            (contact || '').trim(),
            now
        );
        orgId = Number(orgResult.lastInsertRowid);
        insertAccount.run(orgId, normalizedEmail, password_hash, now);
        db.prepare('COMMIT').run();
    } catch (err) {
        db.prepare('ROLLBACK').run();
        throw err;
    }

    // Auto-login after registration
    req.session.orgId = orgId;
    req.session.orgName = name.trim();
    req.session.orgType = type || 'Standard';
    req.session.email = normalizedEmail;

    return res.status(201).json({
        message: 'Account created successfully.',
        org: { org_id: orgId, name: name.trim(), type: type || 'Standard' }
    });
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(req, res) {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();

    const account = db.prepare(`
        SELECT a.account_id, a.org_id, a.password_hash, o.name, o.type, o.is_deleted
        FROM org_accounts a
        JOIN organisations o ON a.org_id = o.org_id
        WHERE a.email = ?
    `).get(normalizedEmail);

    if (!account) {
        // Deliberate vague message to prevent user enumeration
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Block deleted/deactivated organisations from logging in
    if (account.is_deleted) {
        return res.status(403).json({ error: 'This organisation account has been deactivated. Please contact the administrator.' });
    }

    const match = await bcrypt.compare(password, account.password_hash);
    if (!match) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Regenerate session to prevent fixation
    req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Session error. Please try again.' });

        req.session.orgId = account.org_id;
        req.session.orgName = account.name;
        req.session.orgType = account.type;
        req.session.email = normalizedEmail;

        return res.status(200).json({
            message: 'Login successful.',
            org: { org_id: account.org_id, name: account.name, type: account.type }
        });
    });
}

// ── Logout ────────────────────────────────────────────────────────────────────

function handleLogout(req, res) {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed.' });
        res.clearCookie('kcf.sid');
        return res.status(200).json({ message: 'Logged out successfully.' });
    });
}

// ── Session Check (me) ────────────────────────────────────────────────────────

function handleMe(req, res) {
    if (!req.session || !req.session.orgId) {
        return res.status(401).json({ authenticated: false });
    }
    return res.status(200).json({
        authenticated: true,
        org: {
            org_id: req.session.orgId,
            name: req.session.orgName,
            type: req.session.orgType,
            email: req.session.email
        }
    });
}

