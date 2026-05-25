import pg from "pg";
import { env } from "@/lib/config";

let pool: pg.Pool | null | undefined;

export function createPgPool() {
  if (pool !== undefined) return pool;
  if (!env.DATABASE_URL) {
    pool = null;
    return pool;
  }
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5
  });
  return pool;
}
