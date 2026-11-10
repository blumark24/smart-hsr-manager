'use strict';

const readline = require('node:readline');
const admin = require('firebase-admin');

const STAGING_PROJECT_ID = 'smart-hsr-staging-blumark24';

function question(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, answer => resolve(String(answer || '').trim())));
}

function hiddenQuestion(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) return reject(new Error('Interactive TTY required for password entry.'));
    stdout.write(prompt);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = ch => {
      if (ch === '\u0003') {
        cleanup();
        process.exit(130);
      }
      if (ch === '\r' || ch === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (ch === '\u007f') {
        if (value.length) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      value += ch;
      stdout.write('*');
    };
    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    }
    stdin.on('data', onData);
  });
}

function validatePassword(password, email) {
  if (typeof password !== 'string' || password.length < 10) return 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.';
  if (!/[A-Z]/.test(password)) return 'أضف حرفًا إنجليزيًا كبيرًا واحدًا على الأقل.';
  if (!/[a-z]/.test(password)) return 'أضف حرفًا إنجليزيًا صغيرًا واحدًا على الأقل.';
  if (!/\d/.test(password)) return 'أضف رقمًا واحدًا على الأقل.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'أضف رمزًا خاصًا واحدًا على الأقل.';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'لا تجعل كلمة المرور تحتوي اسم البريد.';
  return null;
}

async function main() {
  const projectFromEnv =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    '';

  if (projectFromEnv && projectFromEnv !== STAGING_PROJECT_ID) {
    throw new Error(
      'REFUSED: current cloud project is "' + projectFromEnv +
      '". This bootstrap may run only against "' + STAGING_PROJECT_ID + '".'
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await question(rl, 'Owner email for STAGING: ')).toLowerCase();
  rl.close();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid owner email.');
  }

  const password = await hiddenQuestion('Choose owner password: ');
  const confirmPassword = await hiddenQuestion('Confirm owner password: ');
  if (password !== confirmPassword) throw new Error('Password confirmation does not match.');

  const passwordError = validatePassword(password, email);
  if (passwordError) throw new Error(passwordError);

  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: STAGING_PROJECT_ID,
  }, 'smart-hsr-staging-owner-bootstrap');

  if (app.options.projectId !== STAGING_PROJECT_ID) {
    throw new Error('REFUSED: Firebase Admin resolved a non-staging project.');
  }

  const auth = app.auth();
  const db = app.firestore();

  const ownerSnap = await db.collection('owners').limit(20).get();
  const activeOwners = ownerSnap.docs
    .map(doc => ({ uid: doc.id, ...(doc.data() || {}) }))
    .filter(owner => owner.active !== false);

  const differentActiveOwner = activeOwners.find(owner => {
    const ownerEmail = typeof owner.email === 'string' ? owner.email.trim().toLowerCase() : '';
    return ownerEmail && ownerEmail !== email;
  });

  if (differentActiveOwner) {
    throw new Error(
      'REFUSED: STAGING already has a different active owner. No changes were made.'
    );
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, {
      password,
      disabled: false,
      emailVerified: user.emailVerified,
    });
    await auth.revokeRefreshTokens(user.uid);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      user = await auth.createUser({
        email,
        password,
        disabled: false,
        emailVerified: false,
      });
    } else {
      throw error;
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.collection('owners').doc(user.uid).set({
    uid: user.uid,
    email,
    role: 'owner',
    active: true,
    environment: 'staging',
    bootstrapSource: 'scripts/bootstrap-staging-owner.cjs',
    updatedAt: now,
    createdAt: now,
  }, { merge: true });

  await db.collection('platformAdminAuditEvents').add({
    actorUid: user.uid,
    actorRole: 'owner',
    action: 'staging_owner_bootstrap',
    resourceType: 'owner',
    resourceId: user.uid,
    detail: {
      environment: 'staging',
      targetProjectId: STAGING_PROJECT_ID,
      productionWrite: false,
    },
    createdAt: now,
  });

  console.log('\nSTAGING OWNER READY');
  console.log('Project:', STAGING_PROJECT_ID);
  console.log('Email:', email);
  console.log('UID:', user.uid);
  console.log('Production touched: NO');
  console.log('Password stored in Firestore: NO');
  console.log('\nYou can now sign in to the SMART HSR Preview owner page.');
}

main().catch(error => {
  console.error('\nBOOTSTRAP FAILED');
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
