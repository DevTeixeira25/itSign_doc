import postgres from "postgres";
import { config } from "./config.js";

export let sql: ReturnType<typeof postgres>;
export let useMemory = false;

try {
  sql = postgres(config.databaseUrl, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      bigint: postgres.BigInt,
    },
  });
} catch {
  useMemory = true;
  sql = null as any;
}

/**
 * Test database connectivity.  If PostgreSQL is unreachable we flip to
 * the in-memory store so the app can still run for demo purposes.
 */
export async function initDb(): Promise<void> {
  if (useMemory) return;
  try {
    await sql`SELECT 1`;
    console.log("✓ PostgreSQL connected");
  } catch {
    console.warn("⚠ PostgreSQL unavailable – running in MEMORY mode (data will not persist)");
    useMemory = true;
  }
}

// Graceful shutdown helper
export async function closeDb() {
  if (!useMemory && sql) {
    await sql.end({ timeout: 5 });
  }
}
