import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';

// API Handlers
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
import authHandler from './api/auth.js';
import adminHandler from './api/admin.js';

// Auth middleware
import { requireAuth, requireAdmin } from './lib/auth-middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env / .env.local
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
    } catch (e) { /* ignore */ }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Session store backed by the same SQLite file
const SQLiteStore = connectSqlite3(session);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Session Middleware ────────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'kcf-finance-change-this-in-prod-!@#';
if (!process.env.SESSION_SECRET) {
    console.warn('⚠  SESSION_SECRET not set in .env — using insecure default. Set it before deployment!');
}

app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
    secret: SESSION_SECRET,
    name: 'kcf.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static('public'));

// ── Auth Routes (public — no session required) ────────────────────────────────
app.all('/api/auth/register', (req, res) => authHandler(req, res));
app.all('/api/auth/login',    (req, res) => authHandler(req, res));
app.all('/api/auth/logout',   (req, res) => authHandler(req, res));
app.get('/api/auth/me',       (req, res) => authHandler(req, res));

// ── Admin Routes ──────────────────────────────────────────────────────────────
app.post('/api/admin/login',  (req, res) => adminHandler(req, res));
app.post('/api/admin/logout', (req, res) => adminHandler(req, res));
app.get('/api/admin/me',      (req, res) => adminHandler(req, res));
app.get('/api/admin/organisations',               requireAdmin, (req, res) => adminHandler(req, res));
app.delete('/api/admin/organisations/:id', requireAdmin, (req, res) => {
    // Inject the id into url so handler can parse it
    req.url = `/api/admin/organisations/${req.params.id}`;
    adminHandler(req, res);
});

// ── Protected Financial Routes (org session required) ─────────────────────────
app.all('/api/categories',          requireAuth, (req, res) => categoriesHandler(req, res));
app.all('/api/expenses',            requireAuth, (req, res) => expensesHandler(req, res));
app.all('/api/income',              requireAuth, (req, res) => incomeHandler(req, res));
app.all('/api/budgets/progress',    requireAuth, (req, res) => budgetsProgressHandler(req, res));
app.all('/api/budgets/live-check',  requireAuth, (req, res) => budgetsLiveCheckHandler(req, res));
app.all('/api/budgets/summary',     requireAuth, (req, res) => budgetsSummaryHandler(req, res));
app.all('/api/budgets',             requireAuth, (req, res) => budgetsHandler(req, res));
app.all('/api/dashboard',           requireAuth, (req, res) => dashboardHandler(req, res));

// Organisations: Admin-only for listing all, Auth for own profile
app.get('/api/organisations', requireAuth, (req, res) => organisationsHandler(req, res));
app.post('/api/organisations', (req, res) => organisationsHandler(req, res)); // used internally by register
app.put('/api/organisations',  requireAuth, (req, res) => organisationsHandler(req, res));
app.delete('/api/organisations', requireAdmin, (req, res) => organisationsHandler(req, res));

// DB Init (startup only)
app.all('/api/init-db', (req, res) => initDbHandler(req, res));

// ── Auto-initialize DB on startup ─────────────────────────────────────────────
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

// ── SPA Fallback — serve index.html for any non-API, non-asset route ──────────
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // Allow login.html, register.html, admin.html to be served directly
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 KCF Finance running at http://localhost:${PORT}`);
    console.log(`   Organisation login: http://localhost:${PORT}/login.html`);
    console.log(`   Admin panel:        http://localhost:${PORT}/admin.html`);
});
