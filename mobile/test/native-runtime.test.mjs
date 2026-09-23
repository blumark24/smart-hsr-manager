import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeRuntime } from '../src/native-runtime.mjs';

test('native runtime fails closed on the web', async () => {
  const runtime = createNativeRuntime({ Capacitor: { isNativePlatform: () => false } });
  assert.equal(runtime.isNative, false);
  assert.equal(await runtime.getCurrentPosition(), null);
  assert.equal(await runtime.capturePhoto(), null);
});

test('location is requested before native high-accuracy access', async () => {
  const calls = [];
  const runtime = createNativeRuntime({
    Capacitor: { isNativePlatform: () => true },
    Geolocation: {
      checkPermissions: async () => ({ location: 'prompt' }),
      requestPermissions: async () => {
        calls.push('permission');
        return { location: 'granted' };
      },
      getCurrentPosition: async options => {
        calls.push(options.enableHighAccuracy ? 'high-accuracy' : 'low-accuracy');
        return { coords: { latitude: 1, longitude: 2 } };
      },
    },
  });

  const position = await runtime.getCurrentPosition();
  assert.deepEqual(calls, ['permission', 'high-accuracy']);
  assert.equal(position.coords.latitude, 1);
});

test('camera access is user-permission gated and returns a URI payload', async () => {
  let opened = false;
  const runtime = createNativeRuntime({
    Capacitor: { isNativePlatform: () => true },
    Camera: {
      checkPermissions: async () => ({ camera: 'prompt' }),
      requestPermissions: async () => ({ camera: 'granted' }),
      takePhoto: async options => {
        opened = options.quality === 85 && options.saveToGallery === false;
        return { webPath: 'capacitor://photo/1' };
      },
    },
  });

  const photo = await runtime.capturePhoto();
  assert.equal(opened, true);
  assert.equal(photo.webPath, 'capacitor://photo/1');
});

test('native location watcher exposes an explicit cleanup function', async () => {
  let cleared = null;
  const runtime = createNativeRuntime({
    Capacitor: { isNativePlatform: () => true },
    Geolocation: {
      checkPermissions: async () => ({ location: 'granted' }),
      watchPosition: async (_options, callback) => {
        callback({ coords: { latitude: 1, longitude: 2 } }, null);
        return 'watch-1';
      },
      clearWatch: async ({ id }) => { cleared = id; },
    },
  });

  let seen = false;
  const stop = await runtime.watchPosition(position => { seen = Boolean(position); });
  assert.equal(seen, true);
  await stop();
  assert.equal(cleared, 'watch-1');
});


test('camera bridge rejects silently falling back to deprecated getPhoto', async () => {
  const runtime = createNativeRuntime({
    Capacitor: { isNativePlatform: () => true },
    Camera: {
      checkPermissions: async () => ({ camera: 'granted' }),
      getPhoto: async () => ({ webPath: 'deprecated://photo' }),
    },
  });
  await assert.rejects(() => runtime.capturePhoto(), /CAPACITOR_CAMERA_TAKE_PHOTO_UNAVAILABLE/);
});
