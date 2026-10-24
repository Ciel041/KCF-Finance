import { getDb, getNextSequence } from '../lib/mongodb.js';

export default async function handler(req, res) {
    const { method } = req;
    const { id, org_id } = req.query;

    try {
        const db = await getDb();

        if (method === 'GET') {
            const pipeline = [];
            if (org_id) {
                pipeline.push({ $match: { org_id: Number(org_id) } });
            }

            pipeline.push(
                {
                    $lookup: {
                        from: 'organisations',
                        localField: 'org_id',
                        foreignField: 'org_id',
                        as: 'org'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        income_id: 1,
                        org_id: 1,
                        Source: 1,
                        amount: 1,
                        income_date: 1,
                        description: 1,
                        org_name: { $ifNull: [{ $arrayElemAt: ['$org.name', 0] }, ''] }
                    }
                },
                {
                    $sort: { income_date: -1, income_id: -1 }
                }
            );

            const rows = await db.collection('income').aggregate(pipeline).toArray();
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

            const income_id = await getNextSequence('income_id');
            const doc = {
                income_id,
                org_id: Number(bodyOrgId),
                Source: Source.trim(),
                amount: parseFloat(amount),
                income_date,
                description: description ? description.trim() : '',
                createdAt: new Date()
            };

            await db.collection('income').insertOne(doc);
            return res.status(200).json({ id: income_id, ...doc });
        }

        if (method === 'PUT') {
            if (!id) return res.status(400).json({ error: 'Missing id parameter' });
            const { org_id: bodyOrgId, Source, amount, income_date, description } = req.body;
            const numId = Number(id);

            await db.collection('income').updateOne(
                { income_id: numId },
                {
                    $set: {
                        org_id: Number(bodyOrgId),
                        Source: Source ? Source.trim() : undefined,
                        amount: parseFloat(amount),
                        income_date,
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
            await db.collection('income').deleteOne({ income_id: numId });
            return res.status(200).json({ message: 'Deleted successfully' });
        }

        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return res.status(405).json({ error: `Method ${method} not allowed` });
    } catch (err) {
        console.error('API Error in income:', err);
        return res.status(500).json({ error: err.message });
    }
}
