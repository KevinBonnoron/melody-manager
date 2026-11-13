import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.melodymanager.app',
  appName: 'Melody Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  // The native projects are applications of their own, beside this one.
  android: {
    path: '../android',
  },
  ios: {
    path: '../ios',
  },
};

export default config;
