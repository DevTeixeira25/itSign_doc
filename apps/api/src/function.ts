/**
 * Firebase Cloud Functions (2nd gen) entry point.
 *
 * Wraps the Fastify API as a single Cloud Function called "api".
 * Firebase Hosting rewrites /v1/** requests to this function.
 */
import { onRequest } from "firebase-functions/v2/https";
import { buildApp } from "./app.js";
import { initDb } from "./db.js";

// ── Bootstrap ──────────────────────────────────────────────
let ready = false;
const app = buildApp();

async function ensureReady() {
  if (ready) return;
  await initDb();
  await app.ready();
  ready = true;
}

// ── Cloud Function export ──────────────────────────────────
export const api = onRequest(
  {
    region: "southamerica-east1",
    memory: "512MiB",
    timeoutSeconds: 120,
    minInstances: 0,
    maxInstances: 10,
    concurrency: 80,
  },
  async (req, res) => {
    await ensureReady();
    app.server.emit("request", req, res);
  },
);
