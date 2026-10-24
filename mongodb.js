import { MongoClient } from 'mongodb';

let client;
let clientPromise;

export function getClientPromise() {
    const currentUri = process.env.MONGODB_URI;
    if (!currentUri) {
        throw new Error('CRITICAL: MONGODB_URI environment variable is not set. Please configure it in your Vercel dashboard or .env.local file.');
    }

    if (!global._mongoClientPromise) {
        client = new MongoClient(currentUri, {
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000
        });
        global._mongoClientPromise = client.connect().catch(err => {
            global._mongoClientPromise = null;
            throw err;
        });
    }
    return global._mongoClientPromise;
}

/**
 * Returns the MongoDB Db instance.
 * Automatically selects the database configured in MONGODB_URI (e.g. /expense_manager)
 * or defaults to 'expense_manager' to avoid falling into MongoDB's default 'test' database.
 */
export async function getDb() {
    const connectedClient = await getClientPromise();
    return connectedClient.db(process.env.MONGODB_DB || 'expense_manager');
}

/**
 * Atomic sequence generator for auto-incrementing integer IDs
 * (org_id, cat_id, exp_id, income_id, bud_id)
 * Keeps frontend and relationships 100% compatible with existing code.
 */
export async function getNextSequence(name) {
    const db = await getDb();
    const result = await db.collection('counters').findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
    );
    // In mongodb v6/v7, returns the updated doc directly. Fallback to result.value for v5.
    const seq = result?.seq ?? result?.value?.seq ?? 1;
    return Number(seq);
}
