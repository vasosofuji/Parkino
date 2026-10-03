import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { createApp } from "../server/bootstrap";

let application: ReturnType<typeof createApp> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  application ??= createApp(waitUntil).then(async app => {
    await app.ready();
    return app;
  }).catch(error => {
    application = undefined;
    throw error;
  });
  try {
    const app = await application;
    app.server.emit("request", request, response);
  } catch {
    // Do not expose connection strings or provider errors to public clients.
    console.error("API initialization failed; check database configuration and migrations.");
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ status: "unavailable" }));
  }
}
