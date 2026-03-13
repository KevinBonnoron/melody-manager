export type { ConfigSchemaItem, PluginManifest } from '@melody-manager/plugin-sdk';
export { initializeWatchProviders, loadPlugins } from './loader';
export { pluginRegistry } from './registry';
export type { ImportProvider, PluginCapabilities, SearchProvider, SourcePlugin } from './types';
