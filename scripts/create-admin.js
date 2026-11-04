/**
 * create-admin.js — One-time script to create/reset the Super Admin account.
 * Usage: node scripts/create-admin.js
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from environment or .env file.
 *
 * Run this ONCE after first setup, or to reset the admin password.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
['.env', '.env.local'].forEach(file => {
    try {
        const envPath = path.resolve(__dirname, '..', file);
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...vals] = trimmed.split('=');
                    const value = vals.join('=');
                    if (key && value && !process.env[key.trim()]) {
                        process.env[key.trim()] = value.trim();
                    }
                }
            });
        }
    } catch (e) { /* ignore */ }
});

// Import after env is loaded
import('../lib/sqlite.js').then(async ({ getDb }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        console.error('\n❌ Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file.\n');
        console.log('Add these lines to your .env file:');
        console.log('  ADMIN_EMAIL=admin@kcf.finance');
        console.log('  ADMIN_PASSWORD=your-secure-password-here\n');
        process.exit(1);
    }

    if (password.length < 10) {
        console.error('\n❌ Error: ADMIN_PASSWORD must be at least 10 characters.\n');
        process.exit(1);
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT admin_id FROM admins WHERE email = ?').get(normalizedEmail);
    if (existing) {
        db.prepare('UPDATE admins SET password_hash = ? WHERE email = ?').run(hash, normalizedEmail);
        console.log(`\n✅ Admin password updated for: ${normalizedEmail}\n`);
    } else {
        db.prepare('INSERT INTO admins (email, password_hash, createdAt) VALUES (?, ?, ?)').run(normalizedEmail, hash, now);
        console.log(`\n✅ Super Admin account created: ${normalizedEmail}\n`);
    }

    console.log('You can now log in at /admin.html with these credentials.\n');
    process.exit(0);
});

