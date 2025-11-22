import type { SearchType } from '@melody-manager/shared';

export type ConfigSchemaType = 'boolean' | 'string' | 'secret' | 'string-list' | 'number';

export interface ConfigSchemaItem {
  name: string;
  type: ConfigSchemaType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  description?: string;
  version?: string;
  icon?: string;
  entry: string;
  features: ('search' | 'stream' | 'import')[];
  searchTypes?: SearchType[];
  importTypes?: SearchType[];
  configSchema?: ConfigSchemaItem[];
}
