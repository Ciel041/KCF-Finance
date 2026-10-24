import { getDb, getNextSequence } from '../lib/mongodb.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id } = req.query;

    try {
        const db = await getDb();

        if (method === 'GET') {
            const rows = await db.collection('organisations')
                .find({})
                .sort({ org_id: 1 })
                .toArray();
            return res.status(200).json(rows);
        }

        if (method === 'POST') {
            const { name, type, address, Contact } = req.body;
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Organisation name is required' });
            }

            const org_id = await getNextSequence('org_id');
            const doc = {
                org_id,
                name: name.trim(),
                type: type || 'Standard',
                address: address ? address.trim() : '',
                Contact: Contact ? Contact.trim() : '',
                createdAt: new Date()
            };

            await db.collection('organisations').insertOne(doc);
            return res.status(200).json({ id: org_id, ...doc });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { name, type, address, Contact } = req.body;
            const numId = Number(id);

            await db.collection('organisations').updateOne(
                { org_id: numId },
                {
                    $set: {
                        name: name ? name.trim() : undefined,
                        type,
                        address: address ? address.trim() : '',
                        Contact: Contact ? Contact.trim() : '',
                        updatedAt: new Date()
                    }
                }
            );
            return res.status(200).json({ message: 'Updated successfully' });
        }

        if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const numId = Number(id);

            // Cascade delete all related child collections
            await db.collection('expenses').deleteMany({ org_id: numId });
            await db.collection('income').deleteMany({ org_id: numId });
            await db.collection('budgets').deleteMany({ org_id: numId });
            await db.collection('categories').deleteMany({ org_id: numId });
            await db.collection('organisations').deleteOne({ org_id: numId });

            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in organisations:', err);
        return res.status(500).json({ error: err.message });
    }
}
