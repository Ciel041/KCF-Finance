-- ==============================================================================
-- OIKOS (KCF FINANCE) EXPENSE MANAGER — SQL QUERIES SUITE
-- Database: data.sqlite (SQLite 3)
-- Description: Comprehensive operational, reporting, and analytical queries
-- ==============================================================================

-- ==============================================================================
-- SECTION 1: DATABASE STRUCTURE & TABLE AUDITING
-- ==============================================================================

-- 1.1 List all user tables in the database
SELECT name AS table_name 
FROM sqlite_master 
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;

-- 1.2 Inspect table schemas and column definitions
PRAGMA table_info(organisations);
PRAGMA table_info(categories);
PRAGMA table_info(expenses);
PRAGMA table_info(income);
PRAGMA table_info(budgets);

-- 1.3 Record counts across all main tables
SELECT 'organisations' AS table_name, COUNT(*) AS total_records FROM organisations
UNION ALL
SELECT 'categories', COUNT(*) FROM categories
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL
SELECT 'income', COUNT(*) FROM income
UNION ALL
SELECT 'budgets', COUNT(*) FROM budgets;


-- ==============================================================================
-- SECTION 2: ORGANISATIONS & CATEGORIES RETRIEVAL
-- ==============================================================================

-- 2.1 List all institutions with their category counts
SELECT 
    o.org_id,
    o.name AS organisation_name,
    o.type AS institution_type,
    o.address,
    o.Contact,
    COUNT(c.cat_id) AS total_categories
FROM organisations o
LEFT JOIN categories c ON o.org_id = c.org_id
GROUP BY o.org_id, o.name, o.type, o.address, o.Contact
ORDER BY o.org_id ASC;

-- 2.2 List categories grouped with their parent organisations
SELECT 
    c.cat_id,
    c.cat_name,
    c.description,
    o.org_id,
    o.name AS organisation_name
FROM categories c
INNER JOIN organisations o ON c.org_id = o.org_id
ORDER BY o.name ASC, c.cat_name ASC;


-- ==============================================================================
-- SECTION 3: DASHBOARD & FINANCIAL METRICS (INCOME vs EXPENSES)
-- ==============================================================================

-- 3.1 Organization-wise Total Income, Total Expenses, and Net Balance
SELECT 
    o.org_id,
    o.name AS organisation_name,
    COALESCE(inc.total_income, 0.0) AS total_income,
    COALESCE(exp.total_expenses, 0.0) AS total_expenses,
    ROUND(COALESCE(inc.total_income, 0.0) - COALESCE(exp.total_expenses, 0.0), 2) AS net_balance,
    CASE 
        WHEN COALESCE(inc.total_income, 0.0) - COALESCE(exp.total_expenses, 0.0) >= 0 THEN 'Surplus'
        ELSE 'Deficit'
    END AS financial_health
FROM organisations o
LEFT JOIN (
    SELECT org_id, ROUND(SUM(amount), 2) AS total_income
    FROM income
    GROUP BY org_id
) inc ON o.org_id = inc.org_id
LEFT JOIN (
    SELECT org_id, ROUND(SUM(amount), 2) AS total_expenses
    FROM expenses
    GROUP BY org_id
) exp ON o.org_id = exp.org_id
ORDER BY o.org_id ASC;

-- 3.2 Category-wise Expense Breakdown for all Organisations (used in Doughnut Chart)
SELECT 
    o.name AS organisation_name,
    c.cat_name AS category_name,
    COUNT(e.exp_id) AS transaction_count,
    ROUND(SUM(e.amount), 2) AS total_spent,
    ROUND(AVG(e.amount), 2) AS average_expense,
    MIN(e.amount) AS min_expense,
    MAX(e.amount) AS max_expense
FROM expenses e
JOIN categories c ON e.cat_id = c.cat_id
JOIN organisations o ON e.org_id = o.org_id
GROUP BY o.name, c.cat_name
ORDER BY o.name ASC, total_spent DESC;


-- ==============================================================================
-- SECTION 4: BUDGET ENFORCEMENT, PROGRESS & ALERTS
-- ==============================================================================

-- 4.1 Live Budget Progress (Allocated vs Spent vs Remaining & % Used)
SELECT 
    b.bud_id,
    o.name AS organisation_name,
    c.cat_name AS category_name,
    b.period,
    ROUND(b.amount, 2) AS allocated_budget,
    COALESCE(ROUND(spent.actual_spent, 2), 0.0) AS actual_spent,
    ROUND(b.amount - COALESCE(spent.actual_spent, 0.0), 2) AS remaining_balance,
    ROUND((COALESCE(spent.actual_spent, 0.0) / b.amount) * 100, 1) AS percentage_used,
    CASE 
        WHEN COALESCE(spent.actual_spent, 0.0) > b.amount THEN 'OVER BUDGET (Blocked)'
        WHEN (COALESCE(spent.actual_spent, 0.0) / b.amount) >= 0.75 THEN 'WARNING (>=75%)'
        ELSE 'ON TRACK'
    END AS budget_status
FROM budgets b
JOIN organisations o ON b.org_id = o.org_id
JOIN categories c ON b.cat_id = c.cat_id
LEFT JOIN (
    -- Matches expenses dated within the monthly budget period 'YYYY-MM'
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
ORDER BY percentage_used DESC;

-- 4.2 Budgets exceeding 75% threshold (Attention / Action Needed)
SELECT 
    o.name AS organisation_name,
    c.cat_name AS category_name,
    b.period,
    b.amount AS budget_limit,
    COALESCE(SUM(e.amount), 0.0) AS total_spent,
    ROUND(b.amount - COALESCE(SUM(e.amount), 0.0), 2) AS remaining,
    ROUND((COALESCE(SUM(e.amount), 0.0) / b.amount) * 100, 1) AS pct_used
FROM budgets b
JOIN organisations o ON b.org_id = o.org_id
JOIN categories c ON b.cat_id = c.cat_id
LEFT JOIN expenses e ON b.org_id = e.org_id 
                    AND b.cat_id = e.cat_id 
                    AND e.e_date LIKE b.period || '%'
GROUP BY b.bud_id
HAVING pct_used >= 75.0
ORDER BY pct_used DESC;


-- ==============================================================================
-- SECTION 5: INCOME BREAKDOWN & DONOR ANALYSIS
-- ==============================================================================

-- 5.1 Revenue by Source type per organisation
SELECT 
    o.name AS organisation_name,
    i.Source AS income_source,
    COUNT(i.income_id) AS receipt_count,
    ROUND(SUM(i.amount), 2) AS total_received,
    ROUND(AVG(i.amount), 2) AS avg_per_receipt
FROM income i
JOIN organisations o ON i.org_id = o.org_id
GROUP BY o.name, i.Source
ORDER BY o.name ASC, total_received DESC;

-- 5.2 Most recent income entries
SELECT 
    i.income_date,
    o.name AS organisation_name,
    i.Source,
    i.amount,
    i.description
FROM income i
JOIN organisations o ON i.org_id = o.org_id
ORDER BY i.income_date DESC, i.income_id DESC
LIMIT 10;


-- ==============================================================================
-- SECTION 6: CHRONOLOGICAL & TIME-SERIES EXPENSE ANALYSIS
-- ==============================================================================

-- 6.1 Monthly spending trend
SELECT 
    SUBSTR(e_date, 1, 7) AS month_period,
    COUNT(exp_id) AS total_transactions,
    ROUND(SUM(amount), 2) AS monthly_total,
    ROUND(AVG(amount), 2) AS average_per_transaction
FROM expenses
GROUP BY SUBSTR(e_date, 1, 7)
ORDER BY month_period DESC;

-- 6.2 Top 5 largest single expenses recorded
SELECT 
    e.exp_id,
    e.e_date,
    o.name AS organisation_name,
    c.cat_name AS category_name,
    e.amount
FROM expenses e
JOIN organisations o ON e.org_id = o.org_id
JOIN categories c ON e.cat_id = c.cat_id
ORDER BY e.amount DESC
LIMIT 5;


-- ==============================================================================
-- SECTION 7: SAMPLE CRUD QUERIES (TEMPLATE INSERTS, UPDATES, DELETES)
-- ==============================================================================

-- 7.1 Insert a new Organisation (Sample Template)
-- INSERT INTO organisations (name, type, address, Contact, createdAt)
-- VALUES ('Faith Community Home', 'Orphanage', 'Margao, Goa', '9822114477', datetime('now'));

-- 7.2 Insert a new Category for an Organisation
-- INSERT INTO categories (org_id, cat_name, description, createdAt)
-- VALUES (2, 'Medical & Health', 'Medicines and doctor visit expenses', datetime('now'));

-- 7.3 Insert a new Income entry
-- INSERT INTO income (org_id, Source, amount, income_date, description, createdAt)
-- VALUES (2, 'Annual Charity Gala', 12500.00, '2026-10-31', 'Donations from community gala', datetime('now'));

-- 7.4 Insert a new Budget allocation
-- INSERT INTO budgets (org_id, cat_id, amount, period, createdAt)
-- VALUES (2, 2, 2500.00, '2026-11', datetime('now'));

-- 7.5 Insert an Expense (Only if allowed by budget checks)
-- INSERT INTO expenses (org_id, cat_id, amount, e_date, createdAt)
-- VALUES (2, 2, 350.00, '2026-10-31', datetime('now'));

