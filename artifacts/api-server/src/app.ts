import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getPaymentMode } from "./payment-config";
import router from "./routes";

getPaymentMode();
const app = new Hono().basePath("/api");

app.use("*", logger());
app.use("*", secureHeaders());
app.onError((error, context) => {
  console.error("Unhandled API error", error);
  return context.json(
    {
      error: {
        code: "ERREUR_INTERNE",
        message: "Une erreur interne est survenue.",
      },
    },
    500,
  );
});
app.notFound((context) =>
  context.json(
    {
      error: {
        code: "INTROUVABLE",
        message: "Cette ressource est introuvable.",
      },
    },
    404,
  ),
);

app.route("/", router);

export default app;
