export interface ILogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

const consoleLogger: ILogger = {
  error: (msg, ...args) => console.error(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  info: (msg, ...args) => console.info(msg, ...args),
  debug: (msg, ...args) => console.debug(msg, ...args),
};

export function createDefaultLogger(): ILogger {
  return consoleLogger;
}
