import app from "./app";
import { logger } from "./lib/logger";
import { expireStaleCalls } from "./routes/calls";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const callExpiryInterval = setInterval(() => {
      void expireStaleCalls().catch((error: unknown) => {
        logger.error({ err: error }, "Call expiration sweep failed");
      });
    }, 15_000);
    callExpiryInterval.unref();
  } else {
    logger.warn(
      "Call expiration sweep is disabled because Supabase server credentials are not configured.",
    );
  }
});
