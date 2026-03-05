import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, initDb } from "./db.js";

await initDb();

const app = buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    await closeDb();
    process.exit(0);
  });
}
