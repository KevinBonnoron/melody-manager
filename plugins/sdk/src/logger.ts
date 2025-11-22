export interface ILogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

const consoleLogger: ILogger = {
  error: (msg, ...args) => console.error(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  debug: () => {},
};

export function createDefaultLogger(): ILogger {
  return consoleLogger;
}
