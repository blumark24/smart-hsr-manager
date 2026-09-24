(() => {
  'use strict';

  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  const plugins = capacitor?.Plugins || {};
  const geolocation = plugins.Geolocation || null;
  const camera = plugins.Camera || null;

  function permissionDeniedError(message = 'permission-denied') {
    return { code: 1, message };
  }

  async function ensureLocationPermission() {
    if (!isNative || !geolocation) return false;

    const current = await geolocation.checkPermissions();
    if (current?.location === 'granted' || current?.coarseLocation === 'granted') return true;

    const requested = await geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation']
    });

    return requested?.location === 'granted' || requested?.coarseLocation === 'granted';
  }

  async function watchPosition(callback, options = {}) {
    if (!isNative || !geolocation || typeof callback !== 'function') return null;

    const granted = await ensureLocationPermission();
    if (!granted) {
      callback(null, permissionDeniedError());
      return async () => {};
    }

    const id = await geolocation.watchPosition({
      enableHighAccuracy: options.enableHighAccuracy !== false,
      maximumAge: Number.isFinite(options.maximumAge) ? options.maximumAge : 10000,
      timeout: Number.isFinite(options.timeout) ? options.timeout : 14000,
      ...(Number.isFinite(options.interval) ? { interval: options.interval } : {})
    }, (position, error) => callback(position || null, error || null));

    return async () => {
      try { await geolocation.clearWatch({ id }); } catch (_) {}
    };
  }

  async function getCurrentPosition(options = {}) {
    if (!isNative || !geolocation) return null;

    const granted = await ensureLocationPermission();
    if (!granted) throw permissionDeniedError();

    return geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy !== false,
      maximumAge: Number.isFinite(options.maximumAge) ? options.maximumAge : 0,
      timeout: Number.isFinite(options.timeout) ? options.timeout : 15000
    });
  }

  async function captureImageFile() {
    if (!isNative || !camera) return null;

    const current = await camera.checkPermissions();
    let granted = current?.camera === 'granted';

    if (!granted) {
      const requested = await camera.requestPermissions({ permissions: ['camera'] });
      granted = requested?.camera === 'granted';
    }

    if (!granted) throw permissionDeniedError('camera-permission-denied');
    if (typeof camera.takePhoto !== 'function') {
      throw new Error('CAPACITOR_CAMERA_TAKE_PHOTO_UNAVAILABLE');
    }

    const result = await camera.takePhoto({
      quality: 85,
      saveToGallery: false,
      includeMetadata: true
    });

    const source = result?.webPath
      || (result?.uri && capacitor?.convertFileSrc ? capacitor.convertFileSrc(result.uri) : '');

    if (!source) throw new Error('CAPACITOR_CAMERA_RESULT_UNAVAILABLE');

    const response = await fetch(source);
    if (!response.ok) throw new Error('CAPACITOR_CAMERA_FILE_READ_FAILED');

    const blob = await response.blob();
    const type = /^image\/(jpeg|png|webp)$/i.test(blob.type) ? blob.type : 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';

    return new File(
      [blob],
      `smart-hsr-${Date.now()}.${ext}`,
      { type }
    );
  }

  window.SmartHsrNativeBridge = Object.freeze({
    isNative,
    hasGeolocation: Boolean(isNative && geolocation),
    hasCamera: Boolean(isNative && camera),
    ensureLocationPermission,
    watchPosition,
    getCurrentPosition,
    captureImageFile
  });

  window.dispatchEvent(new CustomEvent('smart-hsr-native-ready', {
    detail: {
      isNative,
      hasGeolocation: Boolean(isNative && geolocation),
      hasCamera: Boolean(isNative && camera)
    }
  }));
})();
