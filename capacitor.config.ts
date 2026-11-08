import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.melodymanager.app',
  appName: 'Melody Manager',
  webDir: 'apps/client/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
