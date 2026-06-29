/* ════════════════════════════════════════════════════════════════════════
   VAULT — Backend (zero-dependency Node.js)
   ════════════════════════════════════════════════════════════════════════
   Зачем нужен бэкенд (а не только статика):
     • Токен LZT Market — СЕКРЕТ. Его нельзя класть во фронтенд (его увидит
       любой). Здесь токен живёт в переменной окружения и НИКОГДА не уходит
       в браузер — все запросы к LZT идут через серверный прокси.
     • Реальная авторизация владельца (подписанная сессия-cookie), а не
       пароль в JS на клиенте.
     • Telegram-уведомления, серверное хранилище настроек.

   Запуск:  node server/index.js   (нужен только Node ≥ 18, без npm install)
   Конфиг:  переменные окружения (см. .env.example). Можно через .env —
            мы читаем его сами, без зависимостей.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// ─── минимальный загрузчик .env (без зависимостей) ───
(function loadEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const CFG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  webDir: path.join(__dirname, '..', 'web'),
  configFile: process.env.CONFIG_FILE || path.join(__dirname, '..', 'data', 'store-config.json'),
  ownerPassword: process.env.OWNER_PASSWORD || '',
  ownerHash: process.env.OWNER_PASSWORD_HASH || '',          // sha256 hex (предпочтительно)
  sessionSecret: process.env.SESSION_SECRET || '',
  lztToken: process.env.LZT_TOKEN || '',
  lztHost: process.env.LZT_HOST || 'prod-api.lzt.market',
  tgToken: process.env.TELEGRAM_BOT_TOKEN || '',
  tgChat: process.env.TELEGRAM_CHAT_ID || '',
  secureCookie: process.env.SECURE_COOKIE === '1',
};

// ─── предупреждения о безопасности при старте ───
if (!CFG.sessionSecret) {
  CFG.sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[security] SESSION_SECRET не задан — сгенерирован временный (сессии сбросятся при перезапуске). Задайте его в .env!');
}
if (!CFG.ownerPassword && !CFG.ownerHash) {
  CFG.ownerPassword = 'owner';
  console.warn('[security] ⚠ OWNER_PASSWORD не задан — используется "owner". ОБЯЗАТЕЛЬНО смените перед публикацией!');
}
if (!CFG.lztToken) console.warn('[lzt] LZT_TOKEN не задан — сайт работает в ДЕМО-режиме (сид-данные во фронтенде).');

// ════════════════════════ helpers ════════════════════════
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function timingEq(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function checkOwnerPassword(pw) {
  if (CFG.ownerHash) return timingEq(sha256(pw), CFG.ownerHash.toLowerCase());
  return timingEq(pw, CFG.ownerPassword);
}
// подписанная сессия-cookie: base64(payload).hmac
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', CFG.sessionSecret).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const exp = crypto.createHmac('sha256', CFG.sessionSecret).update(body).digest('base64url');
  if (!timingEq(sig, exp)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('='); if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function isOwner(req) {
  const s = verifySession(parseCookies(req).vault_sess);
  return !!(s && s.owner);
}
function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, Object.assign({
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }, headers));
  res.end(body);
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let b = ''; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('payload too large')); req.destroy(); } else b += c; });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

// ─── in-memory rate limiter (на IP, для /api) ───
const rl = new Map();
function rateLimit(ip, max = 60, win = 60000) {
  const now = Date.now(); const e = rl.get(ip);
  if (!e || now > e.reset) { rl.set(ip, { n: 1, reset: now + win }); return true; }
  if (e.n >= max) return false;
  e.n++; return true;
}

// ─── серверный кэш листингов LZT ───
const cache = new Map();
function cacheGet(k, ttl) { const e = cache.get(k); if (e && Date.now() - e.t < ttl) return e.v; return null; }
function cacheSet(k, v) { cache.set(k, { v, t: Date.now() }); }

// ─── прокси к LZT (токен добавляется на сервере, в браузер не уходит) ───
function lztRequest(method, pathQuery, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: CFG.lztHost, path: pathQuery, method,
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + CFG.lztToken },
    };
    if (body) { opts.headers['Content-Type'] = 'application/json'; }
    const r = https.request(opts, resp => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => { try { resolve({ status: resp.statusCode, json: JSON.parse(d || '{}') }); } catch { resolve({ status: resp.statusCode, json: {} }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
function telegramSend(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: CFG.tgChat, text, parse_mode: 'HTML' });
    const r = https.request({ host: 'api.telegram.org', path: `/bot${CFG.tgToken}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve({ status: resp.statusCode, body: d })); });
    r.on('error', reject); r.write(payload); r.end();
  });
}

// ════════════════════════ static files ════════════════════════
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const fp = path.normalize(path.join(CFG.webDir, rel));
  if (!fp.startsWith(CFG.webDir)) return send(res, 403, 'Forbidden');           // защита от path traversal
  fs.readFile(fp, (err, data) => {
    if (err) {
      // SPA-фолбэк не нужен (один файл) — отдаём index.html для неизвестных путей без расширения
      if (!path.extname(fp)) return fs.readFile(path.join(CFG.webDir, 'index.html'), (e2, d2) => e2 ? send(res, 404, 'Not found') : send(res, 200, d2.toString(), { 'Content-Type': MIME['.html'] }));
      return send(res, 404, 'Not found');
    }
    const mime = MIME[path.extname(fp)] || 'application/octet-stream';
    const cacheCtl = /\.(png|jpg|webp|svg|woff2|ico)$/.test(fp) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheCtl, 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

// ════════════════════════ API router ════════════════════════
async function api(req, res, u) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip)) return send(res, 429, { error: 'rate_limited' });
  const p = u.pathname;

  // health / demo-detection
  if (p === '/api/health') return send(res, 200, { ok: true, demo: !CFG.lztToken, owner: isOwner(req) });

  // ── owner auth ──
  if (p === '/api/auth/login' && req.method === 'POST') {
    let body = {}; try { body = JSON.parse(await readBody(req)); } catch {}
    await new Promise(r => setTimeout(r, 250));                                  // anti-bruteforce задержка
    if (!body.password || !checkOwnerPassword(String(body.password))) return send(res, 401, { error: 'bad_password' });
    const token = signSession({ owner: true, exp: Date.now() + 7 * 864e5 });
    const cookie = `vault_sess=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}` + (CFG.secureCookie ? '; Secure' : '');
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (p === '/api/auth/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'vault_sess=; HttpOnly; Path=/; Max-Age=0' });
  }
  if (p === '/api/auth/me') return send(res, 200, { owner: isOwner(req) });

  // ── store config (публичный GET, запись только владелец) ──
  if (p === '/api/config') {
    if (req.method === 'GET') {
      try { return send(res, 200, JSON.parse(fs.readFileSync(CFG.configFile, 'utf8'))); }
      catch { return send(res, 200, {}); }
    }
    if (req.method === 'PUT') {
      if (!isOwner(req)) return send(res, 403, { error: 'forbidden' });
      let body; try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad_json' }); }
      try { fs.mkdirSync(path.dirname(CFG.configFile), { recursive: true }); fs.writeFileSync(CFG.configFile, JSON.stringify(body, null, 2)); }
      catch (e) { return send(res, 500, { error: 'write_failed' }); }
      return send(res, 200, { ok: true });
    }
  }

  // ── Telegram тест (владелец) ──
  if (p === '/api/notify/test' && req.method === 'POST') {
    if (!isOwner(req)) return send(res, 403, { error: 'forbidden' });
    if (!CFG.tgToken || !CFG.tgChat) return send(res, 400, { error: 'telegram_not_configured' });
    try { const r = await telegramSend('✅ <b>Vault</b>: тестовое уведомление. Бот подключён.'); return send(res, r.status === 200 ? 200 : 502, { ok: r.status === 200, status: r.status }); }
    catch (e) { return send(res, 502, { error: 'telegram_failed' }); }
  }

  // ── LZT proxy (токен на сервере, в браузер не уходит) ──
  if (p.startsWith('/api/lzt/')) {
    if (!CFG.lztToken) return send(res, 503, { error: 'demo_mode', demo: true });
    const lztPath = '/' + p.slice('/api/lzt/'.length) + (u.search || '');
    // чтение листингов — публично и кэшируется; покупка/выдача данных — только владелец
    const sensitive = req.method !== 'GET' || /\/(fast-buy|mafile|letters)(\b|\/|\?|$)/.test(lztPath);
    if (sensitive && !isOwner(req)) return send(res, 403, { error: 'forbidden', hint: 'нужна авторизация владельца' });
    const ck = req.method + ' ' + lztPath;
    if (req.method === 'GET') { const c = cacheGet(ck, 5 * 60000); if (c) return send(res, 200, c); }
    let body = null; if (req.method !== 'GET') { try { body = JSON.parse(await readBody(req)); } catch {} }
    try {
      const r = await lztRequest(req.method, lztPath, body);
      if (req.method === 'GET' && r.status === 200) cacheSet(ck, r.json);
      return send(res, r.status, r.json);
    } catch (e) { return send(res, 502, { error: 'upstream_failed' }); }
  }

  return send(res, 404, { error: 'not_found' });
}

// ════════════════════════ server ════════════════════════
http.createServer((req, res) => {
  let u; try { u = new URL(req.url, 'http://x'); } catch { return send(res, 400, 'Bad request'); }
  if (u.pathname.startsWith('/api/')) return api(req, res, u).catch(() => send(res, 500, { error: 'server_error' }));
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, u.pathname);
}).listen(CFG.port, CFG.host, () => {
  console.log(`\n  Магазин → http://localhost:${CFG.port}`);
  console.log(`  Режим: ${CFG.lztToken ? 'LIVE (LZT подключён)' : 'ДЕМО (сид-данные)'}`);
  console.log(`  Админка: http://localhost:${CFG.port}/#admin\n`);
});
