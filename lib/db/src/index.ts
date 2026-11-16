import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Neon WebSockets tunnel PostgreSQL over HTTPS (443), which works on networks
// that block direct PostgreSQL TCP connections. Node 22 provides WebSocket.
if (typeof globalThis.WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}

let pool: Pool | undefined;
let database: NeonDatabase<typeof schema> | undefined;

/** Create the database connection on first use, not while importing the API. */
export function getDb() {
  if (!database) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be set before database access.");
    }
    pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
    database = drizzle(pool, { schema });
  }
  return database;
}

export async function closeDb() {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    database = undefined;
    await activePool.end();
  }
}

export * from "./schema";
export { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, not, or, sql } from "drizzle-orm";
export type { SQL } from "drizzle-orm";
