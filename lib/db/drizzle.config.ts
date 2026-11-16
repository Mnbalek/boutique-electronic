import { defineConfig } from "drizzle-kit";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const localEnvPath = join(configDirectory, "../../.env");
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

export default defineConfig({
  schema: `${join(configDirectory, "src/schema").replaceAll("\\", "/")}/*.ts`,
  dialect: "postgresql",
  dbCredentials: {
    // A URL is only needed by push/migrate. Schema generation is offline.
    url: process.env.DATABASE_URL ?? "postgres://localhost/boutik_benin",
  },
});
