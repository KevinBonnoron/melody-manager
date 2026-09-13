// Operator configuration, held in a JSON file next to the server rather than in
// the database so it stays editable when the server will not start.
export interface ServerConfig {
  listenAddr: string;
  publicUrl: string;
  cacheDir: string;
  cacheMaxFiles: number;
  cacheMaxSize: number;
  registrationAllowed: boolean;
}

// What the endpoint returns: the flag alone for anyone, the whole file plus its
// location for an admin.
export type ConfigResponse = Partial<ServerConfig> & { registrationAllowed: boolean; path?: string };
