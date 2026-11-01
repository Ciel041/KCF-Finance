/**
 * ==============================================================================
 * OIKOS (KCF FINANCE) — SQL QUERY RUNNER
 * File: execute_queries.js
 * ==============================================================================
 * Executes analytical, auditing, and reporting queries on `data.sqlite`.
 * 
 * Usage:
 *   1. Run full analytical dashboard report:
 *        node execute_queries.js
 * 
 *   2. Run a custom SQL query directly:
 *        node execute_queries.js "SELECT * FROM organisations"
 * 
 *   3. Run all statements from an external SQL file:
 *        node execute_queries.js --file queries.sql
 * ==============================================================================
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate data.sqlite (checks parent folder, current folder, and workspace root)
const possibleDbPaths = [
    path.resolve(__dirname, '../data.sqlite'),
    path.resolve(__dirname, './data.sqlite'),
    path.resolve(__dirname, '../../data.sqlite')
];

let dbPath = possibleDbPaths.find(p => fs.existsSync(p));
if (!dbPath) {
    dbPath = path.resolve(__dirname, '../data.sqlite');
}

console.log('='.repeat(80));
console.log('  OIKOS (KCF FINANCE) — SQL DATABASE QUERY RUNNER');
console.log('='.repeat(80));
console.log(`Database target : ${dbPath}`);

let db;
try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    console.log(`Status          : Connected successfully (Foreign Keys: ON)`);
    console.log('-'.repeat(80));
} catch (err) {
    console.error(`Error opening database at ${dbPath}:`, err.message);
    process.exit(1);
}

/**
 * Helper to execute a query and print results with formatted title
 */
function runQuery(title, sqlQuery, showEmpty = true) {
    console.log(`\n>>> [REPORT] ${title}`);
    console.log(`SQL: ${sqlQuery.replace(/\s+/g, ' ').trim()}`);

    const startTime = performance.now();
    try {
        const stmt = db.prepare(sqlQuery);
        const rows = stmt.all();
        const duration = (performance.now() - startTime).toFixed(2);

        if (rows && rows.length > 0) {
            console.table(rows);
            console.log(`Found: ${rows.length} row(s) (executed in ${duration}ms)`);
        } else if (showEmpty) {
            console.log(`Result: No records found (0 rows, executed in ${duration}ms).`);
        }
    } catch (err) {
        console.error(`Query Execution Error: ${err.message}`);
    }
}

/**
 * Execute custom query passed as command line argument
 */
const args = process.argv.slice(2);

if (args.length > 0) {
    if (args[0] === '--file' && args[1]) {
        const filePath = path.resolve(process.cwd(), args[1]);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            process.exit(1);
        }
        console.log(`Executing SQL script: ${filePath}\n`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Split by semicolons, ignoring comments
        const statements = content
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        statements.forEach((stmt, idx) => {
            const firstLine = stmt.split('\n')[0].replace(/^--\s*/, '').trim();
            runQuery(`Statement #${idx + 1}: ${firstLine.slice(0, 50)}...`, stmt);
        });
        
        console.log('\nAll statements executed.');
        process.exit(0);
    } else {
        // Run ad-hoc query directly
        const customSql = args.join(' ');
        runQuery('Custom Ad-Hoc Query', customSql);
        process.exit(0);
    }
}

// ==============================================================================
// DEFAULT BATCH RUN: Comprehensive Diagnostic & Financial Analytical Reports
// ==============================================================================

// 1. Table Counts Audit
runQuery('1. Database Tables & Record Counts', `
    SELECT 'organisations' AS table_name, COUNT(*) AS count FROM organisations
    UNION ALL SELECT 'categories', COUNT(*) FROM categories
    UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
    UNION ALL SELECT 'income', COUNT(*) FROM income
    UNION ALL SELECT 'budgets', COUNT(*) FROM budgets;
`);

// 2. Active Organisations
runQuery('2. Active Organisations & Category Counts', `
    SELECT 
        o.org_id,
        o.name AS organisation,
        o.type,
        o.address,
        o.Contact,
        COUNT(c.cat_id) AS total_categories
    FROM organisations o
    LEFT JOIN categories c ON o.org_id = c.org_id
    GROUP BY o.org_id, o.name, o.type, o.address, o.Contact
    ORDER BY o.org_id ASC;
`);

// 3. Organization-wise Income vs Expenses (Financial Health)
runQuery('3. Financial Summary: Income vs Expenses & Net Balance', `
    SELECT 
        o.name AS organisation,
        COALESCE(inc.total_income, 0.0) AS total_income,
        COALESCE(exp.total_expenses, 0.0) AS total_expenses,
        ROUND(COALESCE(inc.total_income, 0.0) - COALESCE(exp.total_expenses, 0.0), 2) AS net_balance,
        CASE 
            WHEN COALESCE(inc.total_income, 0.0) - COALESCE(exp.total_expenses, 0.0) >= 0 THEN 'Surplus (+)'
            ELSE 'Deficit (-)'
        END AS status
    FROM organisations o
    LEFT JOIN (
        SELECT org_id, ROUND(SUM(amount), 2) AS total_income 
        FROM income GROUP BY org_id
    ) inc ON o.org_id = inc.org_id
    LEFT JOIN (
        SELECT org_id, ROUND(SUM(amount), 2) AS total_expenses 
        FROM expenses GROUP BY org_id
    ) exp ON o.org_id = exp.org_id
    ORDER BY o.org_id ASC;
`);

// 4. Budget Enforcement & Utilization Tracking
runQuery('4. Active Budgets Utilization & Progress (% Used)', `
    SELECT 
        b.bud_id,
        o.name AS organisation,
        c.cat_name AS category,
        b.period,
        b.amount AS budget_allocated,
        COALESCE(ROUND(spent.actual_spent, 2), 0.0) AS actual_spent,
        ROUND(b.amount - COALESCE(spent.actual_spent, 0.0), 2) AS remaining_balance,
        ROUND((COALESCE(spent.actual_spent, 0.0) / b.amount) * 100, 1) || '%' AS percentage_used,
        CASE 
            WHEN COALESCE(spent.actual_spent, 0.0) > b.amount THEN 'OVER BUDGET [BLOCKED]'
            WHEN (COALESCE(spent.actual_spent, 0.0) / b.amount) >= 0.75 THEN 'WARNING [>=75%]'
            ELSE 'ON TRACK'
        END AS budget_status
    FROM budgets b
    JOIN organisations o ON b.org_id = o.org_id
    JOIN categories c ON b.cat_id = c.cat_id
    LEFT JOIN (
        SELECT 
            e.org_id, 
            e.cat_id, 
            SUBSTR(e.e_date, 1, 7) AS exp_period,
            SUM(e.amount) AS actual_spent
        FROM expenses e
        GROUP BY e.org_id, e.cat_id, SUBSTR(e.e_date, 1, 7)
    ) spent ON b.org_id = spent.org_id 
           AND b.cat_id = spent.cat_id 
           AND b.period = spent.exp_period
    ORDER BY (COALESCE(spent.actual_spent, 0.0) / b.amount) DESC;
`);

// 5. Category-wise Spending
runQuery('5. Category Spending Breakdown', `
    SELECT 
        o.name AS organisation,
        c.cat_name AS category,
        COUNT(e.exp_id) AS transactions,
        ROUND(SUM(e.amount), 2) AS total_spent,
        ROUND(AVG(e.amount), 2) AS average_expense
    FROM expenses e
    JOIN organisations o ON e.org_id = o.org_id
    JOIN categories c ON e.cat_id = c.cat_id
    GROUP BY o.name, c.cat_name
    ORDER BY total_spent DESC;
`);

// 6. Income Sources Analysis
runQuery('6. Revenue Sources Analysis', `
    SELECT 
        o.name AS organisation,
        i.Source AS source,
        COUNT(i.income_id) AS entries,
        ROUND(SUM(i.amount), 2) AS total_amount
    FROM income i
    JOIN organisations o ON i.org_id = o.org_id
    GROUP BY o.name, i.Source
    ORDER BY total_amount DESC;
`);

// 7. Recent 5 Expenses
runQuery('7. Most Recent Expenses', `
    SELECT 
        e.exp_id,
        e.e_date AS date,
        o.name AS organisation,
        c.cat_name AS category,
        '$' || PRINTF('%.2f', e.amount) AS amount
    FROM expenses e
    JOIN organisations o ON e.org_id = o.org_id
    JOIN categories c ON e.cat_id = c.cat_id
    ORDER BY e.e_date DESC, e.exp_id DESC
    LIMIT 5;
`);

console.log('\n' + '='.repeat(80));
console.log('  ALL QUERIES EXECUTED SUCCESSFULLY!');
console.log('='.repeat(80));
console.log('Tip: You can execute any custom SQL query using:');
console.log('  node execute_queries.js "SELECT * FROM organisations"');
console.log('='.repeat(80) + '\n');

