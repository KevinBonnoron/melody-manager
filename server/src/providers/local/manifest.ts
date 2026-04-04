import type { PluginManifest } from '@melody-manager/shared';

export const localManifest: PluginManifest = {
  id: 'local',
  name: 'Local Files',
  description: 'Import and stream music from local files on disk',
  version: '1.0.0',
  icon: 'hard-drive',
  entry: '',
  scope: 'public',
  features: ['import', 'stream'],
  importTypes: ['track'],
  configSchema: [
    {
      name: 'path',
      type: 'string',
      label: 'Music directory',
      description: 'Path to the local directory containing music files',
      required: true,
    },
  ],
};
