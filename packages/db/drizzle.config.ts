import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    // Matches docker-compose.yml; override with a real .env for anything else.
    url: process.env.DATABASE_URL ?? 'postgres://kaiden:kaiden@localhost:5433/kaiden',
  },
});
