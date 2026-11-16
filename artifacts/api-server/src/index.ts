import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";

const localEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);
const { default: app } = await import("./app");

const port = Number(process.env["PORT"] ?? 8080);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${port}"`);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.info(
    `API development server listening on http://127.0.0.1:${info.port}`,
  );
});
