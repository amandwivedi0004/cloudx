import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cloudx.app',
  appName: 'CloudX',
  webDir: '.next',
  server: {
    url: 'https://cloudx.vercel.app',
    cleartext: false,
  },
};

export default config;