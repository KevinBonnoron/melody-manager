import type { SearchType } from './search-result.type';

export type ConfigSchemaType = 'boolean' | 'string' | 'secret' | 'textarea' | 'string-list' | 'number';

export interface ConfigSchemaItem {
  name: string;
  type: ConfigSchemaType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

export type PluginFeature = 'search' | 'stream' | 'import' | 'device';
export type PluginScope = 'public' | 'shared' | 'personal';

export interface PluginManifest {
  // Per capability, the server-level config fields it needs, and, filled by
  // the API since provider_config is admin-only, those still missing.
  requires?: Record<string, string[]>;
  unavailable?: Record<string, string[]>;
  scope: PluginScope;
  id: string;
  name: string;
  description?: string;
  version?: string;
  icon?: string;
  entry: string;
  features: PluginFeature[];
  searchTypes?: SearchType[];
  importTypes?: SearchType[];
  urlPatterns?: string[];
  userConnectable?: boolean;
  configSchema?: ConfigSchemaItem[];
  connectionSchema?: ConfigSchemaItem[];
}
