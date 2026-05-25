import pg from "pg";
import { env } from "@/lib/config";

export function createPgPool() {
  if (!env.DATABASE_URL) return null;
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5
  });
}
