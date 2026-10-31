# Database Queries & Execution Tool

This folder contains SQL queries tailored to the **Oikos Expense Manager** project along with an automated query execution script for `data.sqlite`.

---

## 📁 Files in this Folder

1. **`queries.sql`**  
   Contains organized, production-grade SQL queries for the application:
   - **Section 1:** Database Schema & Table Auditing
   - **Section 2:** Organisations & Category Hierarchy
   - **Section 3:** Financial Summaries (Income vs Expenses, Net Balances)
   - **Section 4:** Budget Tracking, Live Utilization (% Used), and Over-Budget Alerts
   - **Section 5:** Income Breakdown & Donor Analysis
   - **Section 6:** Chronological & Time-Series Expense Analysis
   - **Section 7:** CRUD Template Queries (Insert, Update, Delete templates)

2. **`execute_queries.js`**  
   Node.js script that connects directly to `data.sqlite` using the built-in `node:sqlite` engine and formats output into readable tables.

---

## 🚀 How to Run the Queries

Open your terminal in this directory:
```bash
cd "c:\Users\Franzil\Downloads\expense manager\expense manager\database_queries"
```

### 1. Run the Full Analytical & Financial Dashboard Report
```bash
node execute_queries.js
```
*Outputs table counts, financial surpluses/deficits, budget progress cards, category spending distributions, and recent transactions.*

### 2. Run Any Custom Ad-Hoc SQL Query
Pass your SQL query enclosed in quotes:
```bash
node execute_queries.js "SELECT * FROM organisations"
```
```bash
node execute_queries.js "SELECT cat_name, SUM(amount) FROM expenses e JOIN categories c ON e.cat_id = c.cat_id GROUP BY cat_name"
```

### 3. Run All Statements from an External SQL File
```bash
node execute_queries.js --file queries.sql
```

