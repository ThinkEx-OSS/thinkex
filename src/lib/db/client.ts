import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

const connectionString = process.env.DATABASE_URL!;

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { 
  schema: { ...schema, ...relations },
});

// Export types for convenience
export type Database = typeof db;
export * from './schema';
export * from './relations';
export * from './types';
