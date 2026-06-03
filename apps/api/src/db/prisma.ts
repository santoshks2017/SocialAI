import 'dotenv/config';
import { PrismaClient } from '../generated/client/index.js';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in environment variables. Please check your .env run setup.");
}

let dbUrl = process.env.DATABASE_URL;
// If using Supabase transaction pooler (port 6543), append pgbouncer=true to avoid prepared statement issues
if (dbUrl.includes(':6543') && !dbUrl.includes('pgbouncer=true')) {
  const separator = dbUrl.includes('?') ? '&' : '?';
  dbUrl = `${dbUrl}${separator}pgbouncer=true`;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});
