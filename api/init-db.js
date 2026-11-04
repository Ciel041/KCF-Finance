import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    try {
        const db = getDb();

        return res.status(200).json({
            message: 'Local SQLite database (data.sqlite) initialized successfully!',
            collections: ['organisations', 'categories', 'expenses', 'income', 'budgets']
        });
    } catch (err) {
        console.error('Database initialization error:', err);
        return res.status(500).json({ error: err.message });
    }
}
