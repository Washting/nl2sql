import { createDatabaseToolkit } from './DatabaseToolkit';

// Global database toolkit instance
let databaseToolkit: any = null;

/**
 * Initialize the global database toolkit instance
 */
export async function initializeDatabaseToolkit(databaseUri: string = 'data/sales_data.db'): Promise<void> {
    if (!databaseToolkit) {
        databaseToolkit = await createDatabaseToolkit(databaseUri);
        console.log('DatabaseToolkit initialized successfully');
    }
}

/**
 * Get the global database toolkit instance
 */
export function getDatabaseToolkit(): any {
    if (!databaseToolkit) {
        throw new Error('DatabaseToolkit not initialized. Call initializeDatabaseToolkit() first.');
    }
    return databaseToolkit;
}

/**
 * Close the database toolkit connection
 */
export async function closeDatabaseToolkit(): Promise<void> {
    if (databaseToolkit) {
        await databaseToolkit.close();
        databaseToolkit = null;
    }
}
