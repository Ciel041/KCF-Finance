/**
 * Income API — /api/income
 * org_id from req.orgId (session) — never trusted from client.
 *
 * Also handles /api/income-sources:
 *   GET  /api/income-sources         → list sources for the org
 *   POST /api/income-sources         → create a new source
 *   DELETE /api/income-sources?id=X  → delete a source (if no income references it)
 */
import { getDb } from '../lib/sqlite.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;
    const orgId = req.orgId; // from session via requireAuth

    // ── Route to income-sources sub-handler if URL contains 'income-sources' ──
    if (req.url && req.url.includes('income-sources')) {
        return handleIncomeSources(req, res, method, orgId, id);
    }

    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare(`
                SELECT
                    i.income_id,
                    i.org_id,
                    i.src_id,
                    COALESCE(s.src_name, i.Source, '') AS source_name,
                    i.amount,
                    i.income_date,
                    i.description,
                    COALESCE(o.name, '') AS org_name
                FROM income i
                LEFT JOIN income_sources s ON i.src_id = s.src_id
                LEFT JOIN organisations o ON i.org_id = o.org_id
                WHERE i.org_id = ?
                ORDER BY i.income_date DESC, i.income_id DESC
            `).all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { src_id, source_name, amount, income_date, description } = req.body;
            if (!src_id && !source_name) {
                return res.status(400).json({ error: 'Income source is required' });
            }
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                return res.status(400).json({ error: 'A valid positive amount is required' });
            }
            if (!income_date) return res.status(400).json({ error: 'Date is required' });

            const db = getDb();
            const now = new Date().toISOString();

            // Resolve src_id: use provided, or look up / create by name
            let resolvedSrcId = src_id ? Number(src_id) : null;
            if (!resolvedSrcId && source_name) {
                // Upsert the source
                db.prepare(
                    `INSERT OR IGNORE INTO income_sources (org_id, src_name, createdAt) VALUES (?, ?, ?)`
                ).run(orgId, source_name.trim(), now);
                const src = db.prepare(
                    `SELECT src_id FROM income_sources WHERE org_id = ? AND src_name = ?`
                ).get(orgId, source_name.trim());
                resolvedSrcId = src ? src.src_id : null;
            }

            // Verify the source belongs to this org
            if (resolvedSrcId) {
                const src = db.prepare(
                    `SELECT src_id FROM income_sources WHERE src_id = ? AND org_id = ?`
                ).get(resolvedSrcId, orgId);
                if (!src) return res.status(403).json({ error: 'Income source not found for your organisation.' });
            }

            // Fetch source name to satisfy NOT NULL constraint on Source column
            const srcRow = resolvedSrcId
                ? db.prepare('SELECT src_name FROM income_sources WHERE src_id = ?').get(resolvedSrcId)
                : null;
            const srcName = srcRow ? srcRow.src_name : (source_name || '').trim();

            const result = db.prepare(`
                INSERT INTO income (org_id, src_id, Source, amount, income_date, description, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(orgId, resolvedSrcId, srcName, parseFloat(amount), income_date, (description || '').trim(), now);

            const income_id = Number(result.lastInsertRowid);

            return res.status(200).json({
                id: income_id,
                income_id,
                org_id: orgId,
                src_id: resolvedSrcId,
                source_name: srcName,
                amount: parseFloat(amount),
                income_date,
                description: (description || '').trim(),
                createdAt: now
            });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { src_id, source_name, amount, income_date, description } = req.body;
            const numId = Number(id);
            const db = getDb();

            // Verify ownership
            const inc = db.prepare('SELECT income_id FROM income WHERE income_id = ? AND org_id = ?').get(numId, orgId);
            if (!inc) return res.status(403).json({ error: 'Income record not found for your organisation.' });

            // Resolve src_id if source_name provided
            let resolvedSrcId = src_id ? Number(src_id) : null;
            if (!resolvedSrcId && source_name) {
                const now = new Date().toISOString();
                db.prepare(
                    `INSERT OR IGNORE INTO income_sources (org_id, src_name, createdAt) VALUES (?, ?, ?)`
                ).run(orgId, source_name.trim(), now);
                const src = db.prepare(
                    `SELECT src_id FROM income_sources WHERE org_id = ? AND src_name = ?`
                ).get(orgId, source_name.trim());
                resolvedSrcId = src ? src.src_id : null;
            }

            const srcRow = resolvedSrcId
                ? db.prepare('SELECT src_name FROM income_sources WHERE src_id = ?').get(resolvedSrcId)
                : null;
            const srcName = srcRow ? srcRow.src_name : (source_name ? source_name.trim() : null);

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE income
                SET src_id = COALESCE(?, src_id),
                    Source = COALESCE(?, Source),
                    amount = ?, income_date = ?, description = ?, updatedAt = ?
                WHERE income_id = ? AND org_id = ?
            `).run(resolvedSrcId, srcName, parseFloat(amount), income_date, (description || '').trim(), now, numId, orgId);

            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);
            const db = getDb();

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

// ── Income Sources sub-handler ────────────────────────────────────────────────

function handleIncomeSources(req, res, method, orgId, id) {
    try {
        const db = getDb();

        if (method === 'GET') {
            const rows = db.prepare(`
                SELECT src_id, src_name, createdAt
                FROM income_sources
                WHERE org_id = ?
                ORDER BY src_name ASC
            `).all(orgId);
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { src_name } = req.body;
            if (!src_name || !src_name.trim()) {
                return res.status(400).json({ error: 'Source name is required' });
            }
            const now = new Date().toISOString();
            try {
                const result = db.prepare(`
                    INSERT INTO income_sources (org_id, src_name, createdAt) VALUES (?, ?, ?)
                `).run(orgId, src_name.trim(), now);
                return res.status(200).json({
                    src_id: Number(result.lastInsertRowid),
                    org_id: orgId,
                    src_name: src_name.trim(),
                    createdAt: now
                });
            } catch (e) {
                if (e.message && e.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'An income source with this name already exists.' });
                }
                throw e;
            }
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Verify ownership
            const src = db.prepare('SELECT src_id FROM income_sources WHERE src_id = ? AND org_id = ?').get(numId, orgId);
            if (!src) return res.status(403).json({ error: 'Income source not found for your organisation.' });

            // Check if any income records reference this source
            const ref = db.prepare('SELECT COUNT(*) as count FROM income WHERE src_id = ?').get(numId);
            if (ref && ref.count > 0) {
                return res.status(409).json({
                    error: `Cannot delete: ${ref.count} income record(s) reference this source. Update or delete those records first.`
                });
            }

            db.prepare('DELETE FROM income_sources WHERE src_id = ? AND org_id = ?').run(numId, orgId);
            return res.status(200).json({ message: 'Income source deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in income-sources:', err);
        return res.status(500).json({ error: err.message });
    }
}
