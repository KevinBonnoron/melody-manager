import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.melodymanager.app',
  appName: 'Melody Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    MediaSession: {
      alwaysShowNotification: true,
    },
  },
};

export default config;
