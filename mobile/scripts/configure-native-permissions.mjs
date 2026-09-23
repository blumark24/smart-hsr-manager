import fs from 'node:fs';

const iosPlist = new URL('../ios/App/App/Info.plist', import.meta.url);
const androidManifest = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);

function ensurePlistPermission(fileUrl, key, message) {
  if (!fs.existsSync(fileUrl)) return;
  let content = fs.readFileSync(fileUrl, 'utf8');
  if (content.includes(`<key>${key}</key>`)) return;
  content = content.replace(
    '</dict>',
    `  <key>${key}</key>\n  <string>${message}</string>\n</dict>`
  );
  fs.writeFileSync(fileUrl, content);
}

function ensureAndroidPermission(fileUrl, permission) {
  if (!fs.existsSync(fileUrl)) return;
  let content = fs.readFileSync(fileUrl, 'utf8');
  const declaration = `<uses-permission android:name="${permission}" />`;
  if (content.includes(declaration)) return;
  content = content.replace(
    /(<manifest\b[^>]*>)/,
    `$1\n    ${declaration}`
  );
  fs.writeFileSync(fileUrl, content);
}

ensurePlistPermission(
  iosPlist,
  'NSCameraUsageDescription',
  'يستخدم SMART HSR الكاميرا لتوثيق البلاغات والأدلة الميدانية.'
);
ensurePlistPermission(
  iosPlist,
  'NSLocationWhenInUseUsageDescription',
  'يستخدم SMART HSR موقع الجهاز لتوثيق موقع البلاغ وإظهار المهام القريبة.'
);

ensureAndroidPermission(androidManifest, 'android.permission.CAMERA');
ensureAndroidPermission(androidManifest, 'android.permission.ACCESS_FINE_LOCATION');
ensureAndroidPermission(androidManifest, 'android.permission.ACCESS_COARSE_LOCATION');
