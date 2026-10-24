import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// API Handlers (Unified with Vercel serverless)
import organisationsHandler from './api/organisations.js';
import categoriesHandler from './api/categories.js';
import expensesHandler from './api/expenses.js';
import incomeHandler from './api/income.js';
import budgetsHandler from './api/budgets.js';
import budgetsProgressHandler from './api/budgets/progress.js';
import budgetsLiveCheckHandler from './api/budgets/live-check.js';
import budgetsSummaryHandler from './api/budgets/summary.js';
import dashboardHandler from './api/dashboard/index.js';
import initDbHandler from './api/init-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env or .env.local for local development
['.env', '.env.local'].forEach(file => {
    try {
        const envPath = path.resolve(__dirname, file);
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=');
                    if (key && value && !process.env[key.trim()]) {
                        process.env[key.trim()] = value.trim();
                    }
                }
            });
            console.log(`✓ Loaded environment variables from ${file}`);
        }
    } catch (e) {
        // Ignore env loading errors
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Direct API routes to the unified handlers
app.all('/api/organisations', (req, res) => organisationsHandler(req, res));
app.all('/api/categories', (req, res) => categoriesHandler(req, res));
app.all('/api/expenses', (req, res) => expensesHandler(req, res));
app.all('/api/income', (req, res) => incomeHandler(req, res));
app.all('/api/budgets/progress', (req, res) => budgetsProgressHandler(req, res));
app.all('/api/budgets/live-check', (req, res) => budgetsLiveCheckHandler(req, res));
app.all('/api/budgets/summary', (req, res) => budgetsSummaryHandler(req, res));
app.all('/api/budgets', (req, res) => budgetsHandler(req, res));
app.all('/api/dashboard', (req, res) => dashboardHandler(req, res));
app.all('/api/init-db', (req, res) => initDbHandler(req, res));

// Auto-initialize local SQLite database on startup
try {
    const mockReq = { method: 'POST' };
    const mockRes = {
        status: () => mockRes,
        json: (data) => console.log('✓', data.message),
        setHeader: () => {}
    };
    initDbHandler(mockReq, mockRes);
} catch (err) {
    console.warn('Note: Could not auto-initialize database on startup:', err.message);
}

app.listen(PORT, () => {
    console.log(`🚀 Expense Manager running at http://localhost:${PORT}`);
});
