import { Hono } from "hono";
import { HealthCheckResponse } from "@workspace/api-zod";

const router = new Hono();

router.get("/healthz", (context) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  return context.json(data);
});

export default router;
