export function createNativeRuntime({
  Capacitor,
  Geolocation,
  Camera,
  App,
} = {}) {
  const isNative = Boolean(Capacitor?.isNativePlatform?.());

  async function ensureLocationPermission() {
    if (!isNative || !Geolocation) return { native: false, granted: false };

    const current = await Geolocation.checkPermissions();
    if (current?.location === 'granted' || current?.coarseLocation === 'granted') {
      return { native: true, granted: true };
    }

    const requested = await Geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation'],
    });

    return {
      native: true,
      granted: requested?.location === 'granted' || requested?.coarseLocation === 'granted',
    };
  }

  async function getCurrentPosition() {
    if (!isNative || !Geolocation) return null;
    const permission = await ensureLocationPermission();
    if (!permission.granted) return null;

    return Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 14000,
      maximumAge: 10000,
    });
  }

  async function watchPosition(callback) {
    if (!isNative || !Geolocation || typeof callback !== 'function') return () => {};
    const permission = await ensureLocationPermission();
    if (!permission.granted) return () => {};

    const watchId = await Geolocation.watchPosition({
      enableHighAccuracy: true,
      timeout: 14000,
      maximumAge: 10000,
    }, (position, error) => callback(position || null, error || null));

    return async () => {
      try { await Geolocation.clearWatch({ id: watchId }); } catch (_) {}
    };
  }

  async function capturePhoto() {
    if (!isNative || !Camera) return null;
    const permission = await Camera.checkPermissions();
    let cameraGranted = permission?.camera === 'granted';

    if (!cameraGranted) {
      const requested = await Camera.requestPermissions({ permissions: ['camera'] });
      cameraGranted = requested?.camera === 'granted';
    }

    if (!cameraGranted) return null;

    return Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'uri',
      source: 'camera',
      saveToGallery: false,
      correctOrientation: true,
    });
  }

  async function onAppResume(callback) {
    if (!isNative || !App || typeof callback !== 'function') return () => {};
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) callback();
    });
    return () => handle?.remove?.();
  }

  return Object.freeze({
    isNative,
    ensureLocationPermission,
    getCurrentPosition,
    watchPosition,
    capturePhoto,
    onAppResume,
  });
}
