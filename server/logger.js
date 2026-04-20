export function createLogger(scope) {
  return {
    info(message) {
      process.stdout.write(`[${scope}] ${message}\n`);
    },
  };
}
