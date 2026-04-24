import { startGameServer } from "./gameServer.js";
import { createLogger } from "./logger.js";

const logger = createLogger("bootstrap");

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
  process.exit(1);
});

try {
  startGameServer();
} catch (error) {
  logger.error("Failed to start game server", error);
  process.exit(1);
}
