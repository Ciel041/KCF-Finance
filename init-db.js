import { getDb } from '../lib/mongodb.js';

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    try {
        const db = await getDb();

        // Create indexes for high performance and integrity
        await db.collection('organisations').createIndex({ org_id: 1 }, { unique: true });
        await db.collection('categories').createIndex({ cat_id: 1 }, { unique: true });
        await db.collection('categories').createIndex({ org_id: 1 });
        await db.collection('expenses').createIndex({ exp_id: 1 }, { unique: true });
        await db.collection('expenses').createIndex({ org_id: 1, cat_id: 1, e_date: -1 });
        await db.collection('income').createIndex({ income_id: 1 }, { unique: true });
        await db.collection('income').createIndex({ org_id: 1, income_date: -1 });
        await db.collection('budgets').createIndex({ bud_id: 1 }, { unique: true });
        await db.collection('budgets').createIndex({ org_id: 1, cat_id: 1 });

        return res.status(200).json({
            message: 'MongoDB Atlas connected and collections initialized successfully!',
            collections: ['organisations', 'categories', 'expenses', 'income', 'budgets', 'counters']
        });
    } catch (err) {
        console.error('Database initialization error:', err);
        return res.status(500).json({ error: err.message });
    }
}
