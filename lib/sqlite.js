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
                updatedAt TEXT
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
                createdAt TEXT,
                updatedAt TEXT,
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

        // Migrate/seed existing records if organisations table is empty
        const countRow = dbInstance.prepare('SELECT count(*) as count FROM organisations').get();
        if (countRow && countRow.count === 0) {
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
                    INSERT INTO expenses (exp_id, org_id, cat_id, amount, e_date, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(1, 1, 1, 15215, '2026-10-24', '2026-10-24T09:55:33.946Z');

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
