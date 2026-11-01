import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data.sqlite');

let dbInstance = null;

export function getDb() {
    if (!dbInstance) {
        dbInstance = new DatabaseSync(dbPath);
        dbInstance.exec('PRAGMA foreign_keys = ON;');
        dbInstance.exec('PRAGMA journal_mode = WAL;');

        // Create all tables if they don't exist
        dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS organisations (
                org_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'Standard',
                address TEXT DEFAULT '',
                Contact TEXT DEFAULT '',
                createdAt TEXT,
                updatedAt TEXT,
                is_deleted INTEGER DEFAULT 0,
                deleted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS org_accounts (
                account_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id INTEGER NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                createdAt TEXT,
                FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS admins (
                admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                createdAt TEXT
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                target_org_id INTEGER,
                performed_by TEXT NOT NULL,
                performed_at TEXT NOT NULL,
                details TEXT,
                old_values TEXT,
                new_values TEXT,
                change_reason TEXT,
                is_suspicious INTEGER DEFAULT 0,
                suspicious_reason TEXT
            );

            CREATE TABLE IF NOT EXISTS expense_audit_history (
                history_id INTEGER PRIMARY KEY AUTOINCREMENT,
                exp_id INTEGER NOT NULL,
                org_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                changed_by TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                old_values TEXT,
                new_values TEXT,
                change_reason TEXT,
                is_suspicious INTEGER DEFAULT 0,
                suspicious_reason TEXT
            );

            CREATE TABLE IF NOT EXISTS categories (
                cat_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id INTEGER NOT NULL,
                cat_name TEXT NOT NULL,
                description TEXT DEFAULT '',
                createdAt TEXT,
                updatedAt TEXT,
                FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS expenses (
                exp_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id INTEGER NOT NULL,
                cat_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                e_date TEXT NOT NULL,
                description TEXT DEFAULT '',
                createdAt TEXT,
                updatedAt TEXT,
                edit_count INTEGER DEFAULT 0,
                FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE,
                FOREIGN KEY (cat_id) REFERENCES categories(cat_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS income (
                income_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id INTEGER NOT NULL,
                Source TEXT NOT NULL,
                amount REAL NOT NULL,
                income_date TEXT NOT NULL,
                description TEXT DEFAULT '',
                createdAt TEXT,
                updatedAt TEXT,
                FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS budgets (
                bud_id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id INTEGER NOT NULL,
                cat_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                period TEXT NOT NULL,
                createdAt TEXT,
                updatedAt TEXT,
                FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE,
                FOREIGN KEY (cat_id) REFERENCES categories(cat_id) ON DELETE CASCADE
            );
        `);

        // ── Safe migrations on existing tables ────────────────────────────────
        // These are idempotent ALTER TABLE statements guarded by checking column existence.

        const existingCols = (table) => {
            try {
                const rows = dbInstance.prepare(`PRAGMA table_info(${table})`).all();
                return rows.map(r => r.name);
            } catch { return []; }
        };

        const addColIfMissing = (table, col, type) => {
            if (!existingCols(table).includes(col)) {
                try {
                    dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
                    console.log(`✓ Migrated: ${table}.${col} added`);
                } catch (e) {
                    console.warn(`Migration warning: ${table}.${col}: ${e.message}`);
                }
            }
        };

        // organisations migrations
        addColIfMissing('organisations', 'is_deleted', 'INTEGER DEFAULT 0');
        addColIfMissing('organisations', 'deleted_at', 'TEXT');

        // expenses migrations
        addColIfMissing('expenses', 'description', 'TEXT DEFAULT \'\'');
        addColIfMissing('expenses', 'edit_count', 'INTEGER DEFAULT 0');

        // audit_log migrations
        addColIfMissing('audit_log', 'old_values', 'TEXT');
        addColIfMissing('audit_log', 'new_values', 'TEXT');
        addColIfMissing('audit_log', 'change_reason', 'TEXT');
        addColIfMissing('audit_log', 'is_suspicious', 'INTEGER DEFAULT 0');
        addColIfMissing('audit_log', 'suspicious_reason', 'TEXT');

        // ── Migrate/seed existing records if organisations table is empty ────
        const countRow = dbInstance.prepare('SELECT count(*) as count FROM organisations WHERE is_deleted = 0').get();
        const totalRow = dbInstance.prepare('SELECT count(*) as count FROM organisations').get();
        if (totalRow && totalRow.count === 0) {
            try {
                dbInstance.prepare(`
                    INSERT INTO organisations (org_id, name, type, address, Contact, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(1, 'clco', 'Orphanage', 'margoa', '7643765398', '2026-10-24T09:55:12.680Z');

                dbInstance.prepare(`
                    INSERT INTO categories (cat_id, org_id, cat_name, description, createdAt)
                    VALUES (?, ?, ?, ?, ?)
                `).run(1, 1, 'games', '', '2026-10-24T09:55:30.247Z');

                dbInstance.prepare(`
                    INSERT INTO expenses (exp_id, org_id, cat_id, amount, e_date, createdAt, edit_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(1, 1, 1, 15215, '2026-10-24', '2026-10-24T09:55:33.946Z', 0);

                dbInstance.prepare(`
                    INSERT INTO budgets (bud_id, org_id, cat_id, amount, period, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(1, 1, 1, 14211, '2026-10', '2026-10-24T09:55:51.445Z');

                console.log('✓ Successfully migrated existing records into local data.sqlite');
            } catch (seedErr) {
                console.error('Initial seed error:', seedErr);
            }
        }
    }
    return dbInstance;
}
