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
                Source TEXT DEFAULT '',
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
            if (!existingCols(table).map(c => c.toLowerCase()).includes(col.toLowerCase())) {
                try {
                    dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
                    console.log(`✓ Migrated: ${table}.${col} added`);
                } catch (e) {
                    console.warn(`Migration warning: ${table}.${col}: ${e.message}`);
                }
            }
        };

        const tableExists = (table) => {
            try {
                const row = dbInstance.prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
                ).get(table);
                return !!row;
            } catch { return false; }
        };

        // organisations migrations
        addColIfMissing('organisations', 'is_deleted', 'INTEGER DEFAULT 0');
        addColIfMissing('organisations', 'deleted_at', 'TEXT');
        // Add lowercase 'contact' column if neither 'contact' nor 'Contact' exists yet.
        // SQLite column names are case-sensitive in PRAGMA but case-insensitive in queries,
        // so we only add the column if no variant exists at all.
        {
            const orgColsLower = existingCols('organisations').map(c => c.toLowerCase());
            if (!orgColsLower.includes('contact')) {
                try {
                    dbInstance.exec(`ALTER TABLE organisations ADD COLUMN contact TEXT DEFAULT '';`);
                    console.log('✓ Migrated: organisations.contact added');
                } catch (e) {
                    console.warn('Migration warning: organisations.contact:', e.message);
                }
            }
        }

        // expenses migrations
        addColIfMissing('expenses', 'description', 'TEXT DEFAULT \'\'');
        addColIfMissing('expenses', 'edit_count', 'INTEGER DEFAULT 0');

        // audit_log migrations
        addColIfMissing('audit_log', 'old_values', 'TEXT');
        addColIfMissing('audit_log', 'new_values', 'TEXT');
        addColIfMissing('audit_log', 'change_reason', 'TEXT');
        addColIfMissing('audit_log', 'is_suspicious', 'INTEGER DEFAULT 0');
        addColIfMissing('audit_log', 'suspicious_reason', 'TEXT');

        // ── 2NF Migration: income_sources table ───────────────────────────────
        if (!tableExists('income_sources')) {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS income_sources (
                        src_id   INTEGER PRIMARY KEY AUTOINCREMENT,
                        org_id   INTEGER NOT NULL,
                        src_name TEXT    NOT NULL,
                        createdAt TEXT,
                        UNIQUE(org_id, src_name),
                        FOREIGN KEY (org_id) REFERENCES organisations(org_id) ON DELETE CASCADE
                    );
                `);
                console.log('✓ Migrated: income_sources table created');

                // Seed income_sources from existing distinct income.Source values per org
                if (existingCols('income').includes('Source')) {
                    const distinctSources = dbInstance.prepare(
                        `SELECT DISTINCT org_id, Source FROM income WHERE Source IS NOT NULL AND Source != ''`
                    ).all();
                    const insertSrc = dbInstance.prepare(
                        `INSERT OR IGNORE INTO income_sources (org_id, src_name, createdAt) VALUES (?, ?, ?)`
                    );
                    const now = new Date().toISOString();
                    for (const row of distinctSources) {
                        insertSrc.run(row.org_id, row.Source.trim(), now);
                    }
                    console.log(`✓ Migrated: seeded ${distinctSources.length} income source(s)`);
                }
            } catch (e) {
                console.warn('Migration warning: income_sources creation:', e.message);
            }
        }

        // ── 2NF Migration: income.src_id column ──────────────────────────────
        addColIfMissing('income', 'src_id', 'INTEGER');
        try {
            if (existingCols('income').includes('src_id') && existingCols('income').includes('Source')) {
                // Backfill src_id from income_sources where still NULL
                dbInstance.exec(`
                    UPDATE income
                    SET src_id = (
                        SELECT s.src_id FROM income_sources s
                        WHERE s.org_id = income.org_id AND s.src_name = TRIM(income.Source)
                        LIMIT 1
                    )
                    WHERE src_id IS NULL AND Source IS NOT NULL AND Source != '';
                `);
                console.log('✓ Migrated: income.src_id backfilled from income.Source');
            }
        } catch (e) {
            console.warn('Migration warning: income.src_id backfill:', e.message);
        }

        // ── 2NF Migration: budgets period_type + period_value columns ─────────
        addColIfMissing('budgets', 'period_type', 'TEXT');
        addColIfMissing('budgets', 'period_value', 'TEXT');
        try {
            if (existingCols('budgets').includes('period') &&
                existingCols('budgets').includes('period_type') &&
                existingCols('budgets').includes('period_value')) {

                // Backfill period_type and period_value from existing period strings
                const budgetRows = dbInstance.prepare(
                    `SELECT bud_id, period FROM budgets WHERE period IS NOT NULL AND (period_type IS NULL OR period_value IS NULL)`
                ).all();

                const updateBud = dbInstance.prepare(
                    `UPDATE budgets SET period_type = ?, period_value = ? WHERE bud_id = ?`
                );

                for (const row of budgetRows) {
                    const p = String(row.period || '');
                    let ptype, pvalue;
                    if (/^\d{4}-Q\d$/.test(p)) {
                        ptype = 'quarterly';
                        pvalue = p; // e.g. '2026-Q1'
                    } else if (/^\d{4}-\d{2}$/.test(p)) {
                        ptype = 'monthly';
                        pvalue = p; // e.g. '2026-10'
                    } else if (/^\d{4}$/.test(p)) {
                        ptype = 'yearly';
                        pvalue = p; // e.g. '2026'
                    } else {
                        ptype = 'monthly';
                        pvalue = p; // legacy fallback
                    }
                    updateBud.run(ptype, pvalue, row.bud_id);
                }
                if (budgetRows.length > 0) {
                    console.log(`✓ Migrated: budgets.period_type/period_value backfilled for ${budgetRows.length} row(s)`);
                }
            }
        } catch (e) {
            console.warn('Migration warning: budgets period split:', e.message);
        }

        // ── 2NF Migration: Indexes on FK columns ─────────────────────────────
        const createIndexIfMissing = (name, table, col) => {
            try {
                dbInstance.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${col});`);
            } catch (e) {
                console.warn(`Migration warning: index ${name}:`, e.message);
            }
        };
        createIndexIfMissing('idx_categories_org_id',     'categories',     'org_id');
        createIndexIfMissing('idx_expenses_cat_id',        'expenses',       'cat_id');
        createIndexIfMissing('idx_expenses_org_id',        'expenses',       'org_id');
        createIndexIfMissing('idx_income_org_id',          'income',         'org_id');
        createIndexIfMissing('idx_income_src_id',          'income',         'src_id');
        createIndexIfMissing('idx_budgets_cat_id',         'budgets',        'cat_id');
        createIndexIfMissing('idx_budgets_org_id',         'budgets',        'org_id');
        createIndexIfMissing('idx_income_sources_org_id',  'income_sources', 'org_id');
        console.log('✓ Indexes ensured on FK columns');

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
