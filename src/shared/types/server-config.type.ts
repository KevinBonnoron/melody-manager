export interface ServerConfig {
  listenAddr: string;
  publicUrl: string;
  cacheDir: string;
  cacheMaxFiles: number;
  cacheMaxSize: number;
  registrationAllowed: boolean;
}

export type ConfigResponse = Partial<ServerConfig> & { registrationAllowed: boolean; path?: string };
