/**
 * Income API — /api/income
 * org_id from req.orgId (session) — never trusted from client.
 */
import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    const orgId = req.orgId; // from session via requireAuth

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare(`
                SELECT 
                    i.income_id,
                    i.org_id,
                    i.Source,
                    i.amount,
                    i.income_date,
                    i.description,
                    COALESCE(o.name, '') AS org_name
                FROM income i
                LEFT JOIN organisations o ON i.org_id = o.org_id
                WHERE i.org_id = ?
                ORDER BY i.income_date DESC, i.income_id DESC
            `).all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { Source, amount, income_date, description } = req.body;
            if (!Source || !Source.trim()) return res.status(400).json({ error: 'Income source is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive amount is required' });
            }
            if (!income_date) return res.status(400).json({ error: 'Date is required' });

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO income (org_id, Source, amount, income_date, description, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(orgId, Source.trim(), parseFloat(amount), income_date, (description || '').trim(), now);

            const income_id = Number(result.lastInsertRowid);
            return res.status(200).json({
                id: income_id,
                income_id,
                org_id: orgId,
                Source: Source.trim(),
                amount: parseFloat(amount),
                income_date,
                description: (description || '').trim(),
                createdAt: now
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { Source, amount, income_date, description } = req.body;
            const numId = Number(id);

            // Verify ownership
            const inc = db.prepare('SELECT income_id FROM income WHERE income_id = ? AND org_id = ?').get(numId, orgId);
            if (!inc) return res.status(403).json({ error: 'Income record not found for your organisation.' });

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE income
                SET Source = COALESCE(?, Source), amount = ?, income_date = ?, description = ?, updatedAt = ?
                WHERE income_id = ? AND org_id = ?
            `).run(Source ? Source.trim() : null, parseFloat(amount), income_date, (description || '').trim(), now, numId, orgId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify ownership
            const inc = db.prepare('SELECT income_id FROM income WHERE income_id = ? AND org_id = ?').get(numId, orgId);
            if (!inc) return res.status(403).json({ error: 'Income record not found for your organisation.' });

            db.prepare('DELETE FROM income WHERE income_id = ? AND org_id = ?').run(numId, orgId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in income:', err);
        return res.status(500).json({ error: err.message });
    }
}
