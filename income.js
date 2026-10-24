import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id, org_id } = req.query;

    try {
        const db = getDb();

        if (method === 'GET') {
            let sql = `
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
            `;
            let rows;
            if (org_id) {
                sql += ' WHERE i.org_id = ? ORDER BY i.income_date DESC, i.income_id DESC';
                rows = db.prepare(sql).all(Number(org_id));
            } else {
                sql += ' ORDER BY i.income_date DESC, i.income_id DESC';
                rows = db.prepare(sql).all();
            }

            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { org_id: bodyOrgId, Source, amount, income_date, description } = req.body;
            if (!bodyOrgId) return res.status(400).json({ error: 'Organisation ID is required' });
            if (!Source || !Source.trim()) return res.status(400).json({ error: 'Income source is required' });
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive amount is required' });
            }
            if (!income_date) return res.status(400).json({ error: 'Date is required' });

            const now = new Date().toISOString();
            const result = db.prepare(`
                INSERT INTO income (org_id, Source, amount, income_date, description, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                Number(bodyOrgId),
                Source.trim(),
                parseFloat(amount),
                income_date,
                description ? description.trim() : '',
                now
            );

            const income_id = Number(result.lastInsertRowid);
            const doc = {
                id: income_id,
                income_id,
                org_id: Number(bodyOrgId),
                Source: Source.trim(),
                amount: parseFloat(amount),
                income_date,
                description: description ? description.trim() : '',
                createdAt: now
            };

            return res.status(200).json(doc);
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, Source, amount, income_date, description } = req.body;
            const numId = Number(id);
            const now = new Date().toISOString();

            db.prepare(`
                UPDATE income
                SET org_id = ?,
                    Source = COALESCE(?, Source),
                    amount = ?,
                    income_date = ?,
                    description = ?,
                    updatedAt = ?
                WHERE income_id = ?
            `).run(
                Number(bodyOrgId),
                Source ? Source.trim() : null,
                parseFloat(amount),
                income_date,
                description ? description.trim() : '',
                now,
                numId
            );

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            db.prepare('DELETE FROM income WHERE income_id = ?').run(numId);
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in income:', err);
        return res.status(500).json({ error: err.message });
    }
}
