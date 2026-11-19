import { askRecords } from './assistant.js';
import { authFor } from './auth.js';
import { createWorkbook } from './excel.js';
import { directory, getRecord, importRecords, overview, RequestError, saveRecord, workbookRows } from './records.js';

const maxBody = 1_000_000;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Send JSON data.');
  if (Number(req.headers['content-length']) > maxBody) throw new RequestError(413, 'This request is too large.');
  let content = req.body;
  if (content === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) throw new RequestError(413, 'This request is too large.');
      chunks.push(chunk);
    }
    content = Buffer.concat(chunks).toString('utf8');
  }
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new RequestError(400, 'Send a valid JSON object.');
  }
}

function checkOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, 'Open the workspace directly to make changes.');
  if (req.headers.origin) {
    const host = req.headers.host;
    if (![`${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${host}`, `https://${host}`].includes(req.headers.origin)) {
      throw new RequestError(403, 'Open the workspace directly to make changes.');
    }
  }
}

export function createHandler({ getDb, env = process.env, localAccess = false }) {
  const auth = authFor(env, localAccess);
  const attempts = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      const action = url.searchParams.get('action') || 'session';
      const params = Object.fromEntries(url.searchParams);
      const method = req.method;
      if (method === 'POST') checkOrigin(req);
      if (method === 'GET' && action === 'session') {
        return json(res, 200, { authenticated: auth.check(req), configured: auth.ready, localAccess });
      }
      if (method === 'POST' && action === 'login') {
        const { password } = await body(req);
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        if (attempts.size > 1000) for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
        let entry = attempts.get(ip);
        if (!entry || entry.until <= now) entry = { count: 0, until: now + 15 * 60 * 1000 };
        if (entry.count >= 12) throw new RequestError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        if (attempts.size < 5000 || attempts.has(ip)) attempts.set(ip, { ...entry, count: entry.count + 1 });
        res.setHeader('Set-Cookie', auth.login(password));
        attempts.delete(ip);
        return json(res, 200, { authenticated: true, localAccess });
      }
      if (method === 'POST' && action === 'logout') {
        res.setHeader('Set-Cookie', auth.logout());
        return json(res, 200, { authenticated: false });
      }
      if (!auth.check(req)) throw new RequestError(401, 'Sign in to open the workspace.');
      if (!['GET', 'POST'].includes(method)) throw new RequestError(405, 'This request method is unsupported.');
      if (method === 'GET' && action === 'template') return download(res, await createWorkbook(), 'schooldesk-import-template.xlsx');
      const db = await getDb();
      if (method === 'GET') {
        if (action === 'overview') return json(res, 200, await overview(db));
        if (action === 'school-options') return json(res, 200, (await db.query('SELECT id, code, name FROM schools ORDER BY lower(name), code')).rows);
        if (['schools', 'students', 'history'].includes(action)) return json(res, 200, await directory(db, action, params));
        if (action === 'record') return json(res, 200, await getRecord(db, params.kind, params.id));
        if (action === 'export') {
          const workbook = await createWorkbook(await workbookRows(db, params.school));
          const day = new Date().toISOString().slice(0, 10);
          return download(res, workbook, `schooldesk-records-${day}.xlsx`);
        }
      }
      if (method === 'POST') {
        if (action === 'save') {
          const { kind, record } = await body(req);
          return json(res, 200, await saveRecord(db, kind, record));
        }
        if (action === 'import') return json(res, 200, await importRecords(db, await body(req)));
        if (action === 'ask') return json(res, 200, await askRecords(db, await body(req), env));
      }
      throw new RequestError(404, 'This workspace action could not be found.');
    } catch (error) {
      if (error instanceof RequestError) return json(res, error.status, { error: error.message });
      if (error.code === '23505') return json(res, 409, { error: 'That record identifier is already in use.' });
      if (['40P01', '40001', '55P03'].includes(error.code)) return json(res, 409, { error: 'Another change is being saved. Try again in a moment.' });
      console.error('Schooldesk API request failed', error.code || error.name);
      return json(res, 503, { error: 'The workspace could not complete your request. Try again in a moment.' });
    }
  };
}

function download(res, workbook, name) {
  const bytes = Buffer.from(workbook);
  if (bytes.byteLength > 4_000_000) throw new RequestError(413, 'This export is too large. Open a school and export its records separately.');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', bytes.byteLength);
  res.end(bytes);
}
