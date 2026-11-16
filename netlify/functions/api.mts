import app from "../../artifacts/api-server/src/app";

const config = { path: "/api/*" };

export default {
  fetch: (request: Request) => app.fetch(request),
  config,
};
