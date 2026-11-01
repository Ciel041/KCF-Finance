/**
 * Categories API — /api/categories
 * org_id from session (req.orgId) — not client-supplied.
 */
import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    const orgId = req.orgId; // from session via requireAuth

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare('SELECT * FROM categories WHERE org_id = ? ORDER BY cat_id ASC').all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { cat_name, description } = req.body;
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO categories (org_id, cat_name, description, createdAt)
                VALUES (?, ?, ?, ?)
            `).run(orgId, cat_name.trim(), (description || '').trim(), now);

            const cat_id = Number(result.lastInsertRowid);
            return res.status(200).json({
                id: cat_id, cat_id, org_id: orgId,
                cat_name: cat_name.trim(),
                description: (description || '').trim(),
                createdAt: now
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { cat_name, description } = req.body;
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });
            const numId = Number(id);

            // Verify ownership
            const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(numId, orgId);
            if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE categories SET cat_name = ?, description = ?, updatedAt = ?
                WHERE cat_id = ? AND org_id = ?
            `).run(cat_name.trim(), (description || '').trim(), now, numId, orgId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify ownership
            const cat = db.prepare('SELECT cat_id FROM categories WHERE cat_id = ? AND org_id = ?').get(numId, orgId);
            if (!cat) return res.status(403).json({ error: 'Category not found for your organisation.' });

            db.prepare('DELETE FROM expenses  WHERE cat_id = ? AND org_id = ?').run(numId, orgId);
            db.prepare('DELETE FROM budgets   WHERE cat_id = ? AND org_id = ?').run(numId, orgId);
            db.prepare('DELETE FROM categories WHERE cat_id = ? AND org_id = ?').run(numId, orgId);

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in categories:', err);
        return res.status(500).json({ error: err.message });
    }
}
