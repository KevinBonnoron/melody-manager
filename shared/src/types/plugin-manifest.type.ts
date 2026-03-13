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

export interface PluginManifest {
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
  configSchema?: ConfigSchemaItem[];
}
