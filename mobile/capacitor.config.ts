import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = (process.env.SMART_HSR_MOBILE_SERVER_URL || '').trim();

if (serverUrl && !serverUrl.startsWith('https://')) {
  throw new Error('SMART_HSR_MOBILE_SERVER_URL must use HTTPS.');
}

const config: CapacitorConfig = {
  appId: 'com.blumark24.smarthsr',
  appName: 'SMART HSR',
  webDir: 'www',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
        },
      }
    : {}),
};

export default config;
