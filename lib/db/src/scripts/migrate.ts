import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { closeDb, getDb } from "../index";

const localEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

async function runMigrations() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est requis pour appliquer les migrations.");
  const db = getDb();
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle/", import.meta.url)) });
    console.info("Migrations appliquées via Neon WebSocket.");
  } finally {
    await closeDb();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Échec des migrations : ${message}`);
  process.exitCode = 1;
});
