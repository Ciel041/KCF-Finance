import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare('SELECT * FROM categories ORDER BY cat_id ASC').all();
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { org_id, cat_name, description } = req.body;
            if (!org_id) return res.status(400).json({ error: 'Organisation ID is required' });
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO categories (org_id, cat_name, description, createdAt)
                VALUES (?, ?, ?, ?)
            `).run(
                Number(org_id),
                cat_name.trim(),
                description ? description.trim() : '',
                now
            );

            const cat_id = Number(result.lastInsertRowid);
            const doc = {
                id: cat_id,
                cat_id,
                org_id: Number(org_id),
                cat_name: cat_name.trim(),
                description: description ? description.trim() : '',
                createdAt: now
            };

            return res.status(200).json(doc);
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id, cat_name, description } = req.body;
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });

            const numId = Number(id);
            const now = new Date().toISOString();

            db.prepare(`
                UPDATE categories
                SET org_id = ?,
                    cat_name = ?,
                    description = ?,
                    updatedAt = ?
                WHERE cat_id = ?
            `).run(
                Number(org_id),
                cat_name.trim(),
                description ? description.trim() : '',
                now,
                numId
            );

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            db.prepare('DELETE FROM expenses WHERE cat_id = ?').run(numId);
            db.prepare('DELETE FROM budgets WHERE cat_id = ?').run(numId);
            db.prepare('DELETE FROM categories WHERE cat_id = ?').run(numId);

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in categories:', err);
        return res.status(500).json({ error: err.message });
    }
}
