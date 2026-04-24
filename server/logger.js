export function createLogger(scope) {
  function formatMessage(level, message) {
    return `[${new Date().toISOString()}] [${level}] [${scope}] ${message}\n`;
  }

  return {
    info(message) {
      process.stdout.write(formatMessage("info", message));
    },
    error(message, error = null) {
      const details =
        error instanceof Error
          ? `${message}\n${error.stack || error.message}`
          : error
            ? `${message}\n${String(error)}`
            : message;

      process.stderr.write(formatMessage("error", details));
    },
  };
}
