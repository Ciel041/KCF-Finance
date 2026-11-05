import { getDb } from '../lib/sqlite.js';
import bcrypt from 'bcrypt';

async function seedData() {
    const db = getDb();
    const now = new Date().toISOString();
    const defaultPasswordHash = await bcrypt.hash('Password123!', 12);

    const examples = [
        {
            org: {
                name: 'Sunshine Youth Center',
                type: 'Community Center',
                address: 'Navelim, Goa',
                contact: 'contact@sunshineyouth.org',
                email: 'contact@sunshineyouth.org'
            },
            categories: [
                'Sports Equipment',
                'Event Hosting',
                'Facility Maintenance',
                'Refreshments'
            ],
            income: [
                { source: 'Local Government Grant', amount: 15000, date: '2026-10-01' },
                { source: 'Community Bake Sale', amount: 3200, date: '2026-10-15' },
                { source: 'Private Patron Donation', amount: 5000, date: '2026-10-20' }
            ],
            budgets: [
                { category: 'Sports Equipment', amount: 6000, period: '2026-10', period_type: 'monthly', period_value: '2026-10' },
                { category: 'Event Hosting', amount: 4500, period: '2026-10', period_type: 'monthly', period_value: '2026-10' },
                { category: 'Facility Maintenance', amount: 2000, period: '2026-10', period_type: 'monthly', period_value: '2026-10' }
            ],
            expenses: [
                { category: 'Sports Equipment', amount: 2200, date: '2026-10-05' },
                { category: 'Event Hosting', amount: 1450, date: '2026-10-16' },
                { category: 'Facility Maintenance', amount: 350, date: '2026-10-22' },
                { category: 'Sports Equipment', amount: 800, date: '2026-10-26' }
            ]
        },
        {
            org: {
                name: 'Green Earth Initiative',
                type: 'Environmental NGO',
                address: 'Panjim, Goa',
                contact: 'info@greenearthgoa.org',
                email: 'info@greenearthgoa.org'
            },
            categories: [
                'Tree Plantation',
                'River Cleanup',
                'Awareness Campaigns',
                'Office Supplies'
            ],
            income: [
                { source: 'Corporate CSR Fund', amount: 25000, date: '2026-10-02' },
                { source: 'Individual Memberships', amount: 4500, date: '2026-10-12' },
                { source: 'Merchandise Sales', amount: 1800, date: '2026-10-28' }
            ],
            budgets: [
                { category: 'Tree Plantation', amount: 10000, period: '2026-10', period_type: 'monthly', period_value: '2026-10' },
                { category: 'River Cleanup', amount: 8000, period: '2026-10', period_type: 'monthly', period_value: '2026-10' },
                { category: 'Awareness Campaigns', amount: 5000, period: '2026-10', period_type: 'monthly', period_value: '2026-10' }
            ],
            expenses: [
                { category: 'Tree Plantation', amount: 4500, date: '2026-10-06' },
                { category: 'River Cleanup', amount: 2100, date: '2026-10-14' },
                { category: 'Awareness Campaigns', amount: 1200, date: '2026-10-19' },
                { category: 'Tree Plantation', amount: 850, date: '2026-10-21' }
            ]
        }
    ];

    for (const ex of examples) {
        let existingOrg = db.prepare('SELECT org_id FROM organisations WHERE name = ?').get(ex.org.name);
        let orgId;

        if (existingOrg) {
            orgId = existingOrg.org_id;
            console.log(`Organisation "${ex.org.name}" already exists (org_id: ${orgId}).`);
        } else {
            const orgRes = db.prepare(`
                INSERT INTO organisations (name, type, address, Contact, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `).run(ex.org.name, ex.org.type, ex.org.address, ex.org.contact, now);
            orgId = Number(orgRes.lastInsertRowid);
            console.log(`✓ Added organisation: ${ex.org.name} (org_id: ${orgId})`);

            // Add org account
            db.prepare(`
                INSERT INTO org_accounts (org_id, email, password_hash, createdAt)
                VALUES (?, ?, ?, ?)
            `).run(orgId, ex.org.email, defaultPasswordHash, now);
            console.log(`  ✓ Linked login account: ${ex.org.email} (Password: Password123!)`);
        }

        // Add Categories
        const catMap = {};
        for (const catName of ex.categories) {
            let cat = db.prepare('SELECT cat_id FROM categories WHERE org_id = ? AND cat_name = ?').get(orgId, catName);
            if (!cat) {
                const catRes = db.prepare(`
                    INSERT INTO categories (org_id, cat_name, description, createdAt)
                    VALUES (?, ?, '', ?)
                `).run(orgId, catName, now);
                catMap[catName] = Number(catRes.lastInsertRowid);
                console.log(`  ✓ Category added: ${catName}`);
            } else {
                catMap[catName] = cat.cat_id;
            }
        }

        // Add Income Sources and Income Entries
        for (const inc of ex.income) {
            // Source
            db.prepare(`
                INSERT OR IGNORE INTO income_sources (org_id, src_name, createdAt)
                VALUES (?, ?, ?)
            `).run(orgId, inc.source, now);

            const src = db.prepare('SELECT src_id FROM income_sources WHERE org_id = ? AND src_name = ?').get(orgId, inc.source);
            const srcId = src ? src.src_id : null;

            // Check if income entry already exists
            const existingInc = db.prepare(`
                SELECT income_id FROM income WHERE org_id = ? AND amount = ? AND income_date = ? AND src_id = ?
            `).get(orgId, inc.amount, inc.date, srcId);

            if (!existingInc) {
                db.prepare(`
                    INSERT INTO income (org_id, src_id, Source, amount, income_date, description, createdAt)
                    VALUES (?, ?, ?, ?, ?, '', ?)
                `).run(orgId, srcId, inc.source, inc.amount, inc.date, now);
                console.log(`  ✓ Income recorded: ${inc.source} - ₹${inc.amount} on ${inc.date}`);
            }
        }

        // Add Budgets
        for (const b of ex.budgets) {
            const catId = catMap[b.category];
            if (!catId) {
                console.warn(`Category ${b.category} not found for budget`);
                continue;
            }

            const existingBud = db.prepare(`
                SELECT bud_id FROM budgets WHERE org_id = ? AND cat_id = ? AND period_value = ?
            `).get(orgId, catId, b.period_value);

            if (!existingBud) {
                db.prepare(`
                    INSERT INTO budgets (org_id, cat_id, amount, period, period_type, period_value, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(orgId, catId, b.amount, b.period, b.period_type, b.period_value, now);
                console.log(`  ✓ Budget allocated: ${b.category} - ₹${b.amount} (${b.period_value})`);
            }
        }

        // Add Expenses
        for (const exp of ex.expenses) {
            const catId = catMap[exp.category];
            if (!catId) {
                console.warn(`Category ${exp.category} not found for expense`);
                continue;
            }

            const existingExp = db.prepare(`
                SELECT exp_id FROM expenses WHERE org_id = ? AND cat_id = ? AND amount = ? AND e_date = ?
            `).get(orgId, catId, exp.amount, exp.date);

            if (!existingExp) {
                db.prepare(`
                    INSERT INTO expenses (org_id, cat_id, amount, e_date, description, createdAt, edit_count)
                    VALUES (?, ?, ?, ?, '', ?, 0)
                `).run(orgId, catId, exp.amount, exp.date, now);
                console.log(`  ✓ Expense logged: ${exp.category} - ₹${exp.amount} on ${exp.date}`);
            }
        }
    }

    console.log('\nSeeding completed successfully!');
}

seedData().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});

