import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { RequestError } from './records.js';

const cookieName = 'schooldesk_session';
// Stay signed in for 30 days so the sync skill can run without asking for the password each time.
const sessionSeconds = 30 * 24 * 60 * 60;
const signature = (key, payload) => createHmac('sha256', key).update(payload).digest('base64url');
const safeEqual = (left, right) => timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());

export function authFor(env, localAccess) {
  const password = env.APP_PASSWORD;
  const secret = env.APP_SESSION_SECRET;
  const ready = typeof password === 'string' && password.length >= 12 && typeof secret === 'string' && secret.length >= 32;
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === 'production' || env.VERCEL ? '; Secure' : ''}`;
  return {
    ready: localAccess || ready,
    check(req) {
      if (localAccess) return true;
      if (!ready) return false;
      const value = req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const [expires, proof] = value?.split('.') ?? [];
      if (!/^\d{10}$/.test(expires) || !proof || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
      return safeEqual(proof, signature(secret, `${expires}.${signature(secret, password)}`));
    },
    login(provided) {
      if (!ready) throw new RequestError(503, 'Workspace sign-in has not been configured.');
      if (typeof provided !== 'string' || provided.length > 250 || !safeEqual(password, provided)) {
        throw new RequestError(401, 'That workspace password is incorrect.');
      }
      const expires = Math.floor(Date.now() / 1000) + sessionSeconds;
      return cookie(`${expires}.${signature(secret, `${expires}.${signature(secret, password)}`)}`, sessionSeconds);
    },
    logout: () => cookie('', 0)
  };
}
