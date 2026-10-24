import { getDb, getNextSequence } from '../lib/mongodb.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = await getDb();

        if (method === 'GET') {
            const rows = await db.collection('categories')
                .find({})
                .sort({ cat_id: 1 })
                .toArray();
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { org_id, cat_name, description } = req.body;
            if (!org_id) return res.status(400).json({ error: 'Organisation ID is required' });
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });

            const cat_id = await getNextSequence('cat_id');
            const doc = {
                cat_id,
                org_id: Number(org_id),
                cat_name: cat_name.trim(),
                description: description ? description.trim() : '',
                createdAt: new Date()
            };

            await db.collection('categories').insertOne(doc);
            return res.status(200).json({ id: cat_id, ...doc });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id, cat_name, description } = req.body;
            if (!cat_name || !cat_name.trim()) return res.status(400).json({ error: 'Category name is required' });

            const numId = Number(id);
            await db.collection('categories').updateOne(
                { cat_id: numId },
                {
                    $set: {
                        org_id: Number(org_id),
                        cat_name: cat_name.trim(),
                        description: description ? description.trim() : '',
                        updatedAt: new Date()
                    }
                }
            );
            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Cascade delete child records
            await db.collection('expenses').deleteMany({ cat_id: numId });
            await db.collection('budgets').deleteMany({ cat_id: numId });
            await db.collection('categories').deleteOne({ cat_id: numId });

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in categories:', err);
        return res.status(500).json({ error: err.message });
    }
}
