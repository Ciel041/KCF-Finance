import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare('SELECT * FROM organisations ORDER BY org_id ASC').all();
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { name, type, address, Contact } = req.body;
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Organisation name is required' });
            }

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO organisations (name, type, address, Contact, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                name.trim(),
                type || 'Standard',
                address ? address.trim() : '',
                Contact ? Contact.trim() : '',
                now
            );

            const org_id = Number(result.lastInsertRowid);
            const doc = {
                id: org_id,
                org_id,
                name: name.trim(),
                type: type || 'Standard',
                address: address ? address.trim() : '',
                Contact: Contact ? Contact.trim() : '',
                createdAt: now
            };

            return res.status(200).json(doc);
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { name, type, address, Contact } = req.body;
            const numId = Number(id);
            const now = new Date().toISOString();

            db.prepare(`
                UPDATE organisations
                SET name = COALESCE(?, name),
                    type = COALESCE(?, type),
                    address = ?,
                    Contact = ?,
                    updatedAt = ?
                WHERE org_id = ?
            `).run(
                name ? name.trim() : null,
                type || null,
                address ? address.trim() : '',
                Contact ? Contact.trim() : '',
                now,
                numId
            );

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Delete child records and organisation
            db.prepare('DELETE FROM expenses WHERE org_id = ?').run(numId);
            db.prepare('DELETE FROM income WHERE org_id = ?').run(numId);
            db.prepare('DELETE FROM budgets WHERE org_id = ?').run(numId);
            db.prepare('DELETE FROM categories WHERE org_id = ?').run(numId);
            db.prepare('DELETE FROM organisations WHERE org_id = ?').run(numId);

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in organisations:', err);
        return res.status(500).json({ error: err.message });
    }
}
