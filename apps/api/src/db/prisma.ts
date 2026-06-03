import 'dotenv/config';
import { PrismaClient } from '../generated/client/index.js';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in environment variables. Please check your .env run setup.");
}

let dbUrl = process.env.DATABASE_URL;
// If connecting to a remote database (non-localhost), disable prepared statements
// by appending pgbouncer=true to prevent prepared statement errors on poolers.
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
if (!isLocal && !dbUrl.includes('pgbouncer=true')) {
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
