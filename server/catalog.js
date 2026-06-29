/* ════════════════════════════════════════════════════════════════════════
   КАТАЛОГ — общий кэш листингов + прогрессивная синхронизация + федерация
   ════════════════════════════════════════════════════════════════════════
   БЕЗОПАСНОСТЬ (важно): здесь хранятся и отдаются ТОЛЬКО публичные данные
   листингов (то, что и так видно всем на LZT): item_id, заголовок, цена,
   публичные атрибуты. НИКОГДА: токены, логины/пароли, maFile, письма, баланс,
   сессии. Поэтому делиться этим кэшем между нодами безопасно.

   Покупка ВСЕГДА валидируется вживую через API (fast-buy), поэтому даже если
   в кэше окажется проданный товар — сделка не пройдёт, item уберётся из кэша.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';

// Слаги категорий LZT для обхода (можно переопределить env CATALOG_CATEGORIES).
const DEFAULT_CATS = ['steam', 'fortnite', 'mihoyo', 'riot', 'telegram', 'supercell',
  'origin', 'world-of-tanks', 'epicgames', 'escapefromtarkov', 'socialclub', 'uplay',
  'discord', 'tiktok', 'instagram', 'battlenet', 'vpn', 'roblox', 'warface', 'minecraft', 'gifts'];

const store = new Map();          // key "cat:item_id" -> публичный item
let _syncing = false, _lastSync = 0, _lastError = null;
const _progress = {};             // cat -> до какой страницы дошли

// СТРОГИЙ whitelist публичных полей. Всё остальное (креды и пр.) отбрасывается.
function publicItem(it, cat) {
  if (!it || it.item_id == null) return null;
  const attrs = {};
  const src = it.account_data || it.params || {};
  for (const k of Object.keys(src).slice(0, 24)) {
    const v = src[k];
    if (v == null || typeof v === 'object') continue;     // только примитивы
    if (/token|secret|pass|cookie|session|mafile|e?mail|phone|auth|login|key/i.test(k)) continue; // защита: не выносим чувствительное
    attrs[k] = String(v).slice(0, 80);
  }
  return {
    item_id: it.item_id,
    cat,
    title: String(it.title || it.title_en || (cat + ' #' + it.item_id)).slice(0, 200),
    price: Math.round(it.price_with_seller_fee || it.price || 0),
    price_old: it.price_old ? Math.round(it.price_old) : null,
    origin: it.account_origin ? String(it.account_origin).slice(0, 40) : null,
    attrs,
    ts: Date.now(),
  };
}

function upsert(items, cat) {
  let n = 0;
  for (const it of (items || [])) {
    const pub = publicItem(it, cat);
    if (pub) { store.set(cat + ':' + pub.item_id, pub); n++; }
  }
  return n;
}
function remove(cat, itemId) { return store.delete(cat + ':' + itemId); }
function getItem(cat, itemId) { return store.get(cat + ':' + itemId) || null; }

function list({ cat, q, limit = 200, offset = 0 } = {}) {
  let arr = [...store.values()];
  if (cat && cat !== 'all') arr = arr.filter(x => x.cat === cat);
  if (q) { const s = String(q).toLowerCase(); arr = arr.filter(x => x.title.toLowerCase().includes(s)); }
  const total = arr.length;
  return { total, items: arr.slice(offset, offset + limit) };
}

function stats() {
  const byCat = {};
  for (const v of store.values()) byCat[v.cat] = (byCat[v.cat] || 0) + 1;
  return { total: store.size, byCat, syncing: _syncing, lastSync: _lastSync, lastError: _lastError, progress: { ..._progress } };
}

// ── Прогрессивная параллельная синхронизация ──
// Идём по страницам: страница 1 ВСЕХ категорий, потом страница 2 всех, и т.д.
// Так ни одна категория не "съедает" всё время — наполняются одновременно.
// lztGet('/steam', {page, currency}) — функция из index.js (пул токенов + rate limit).
async function sync(lztGet, { categories, maxPages = 20, currency = 'rub', onProgress } = {}) {
  if (_syncing) return { skipped: true };
  _syncing = true; _lastError = null;
  const cats = categories && categories.length ? categories : (process.env.CATALOG_CATEGORIES ? process.env.CATALOG_CATEGORIES.split(',').map(s => s.trim()) : DEFAULT_CATS);
  const active = new Set(cats);
  try {
    for (let page = 1; page <= maxPages && active.size; page++) {
      await Promise.all([...active].map(async cat => {
        try {
          const r = await lztGet('/' + cat, { page, currency });
          const items = (r && r.items) || [];
          if (items.length) { upsert(items, cat); _progress[cat] = page; if (onProgress) onProgress(); }
          else active.delete(cat);                          // у категории кончились страницы
        } catch (e) { active.delete(cat); }                 // ошибка по категории — не блокируем остальные
      }));
    }
  } catch (e) { _lastError = String(e && e.message || e); }
  finally { _syncing = false; _lastSync = Date.now(); }
  return { ok: true, total: store.size };
}

// ── Федерация: подтянуть публичный каталог у доверенных пиров ──
// peers — список base-URL (env CATALOG_PEERS). Тянем ТОЛЬКО публичные листинги.
// Доверие односторонее: вы сами выбираете, у кого тянуть. Никаких push-эндпоинтов,
// значит чужая нода не может "отравить" ваш кэш.
async function pullPeers(peers, getJson) {
  let merged = 0;
  for (const base of (peers || [])) {
    try {
      const data = await getJson(base.replace(/\/$/, '') + '/api/catalog?limit=100000');
      for (const x of (data && data.items) || []) {
        if (x && x.item_id != null && x.cat) {
          // повторно прогоняем через publicItem-подобную нормализацию (защита от лишних полей)
          store.set(x.cat + ':' + x.item_id, {
            item_id: x.item_id, cat: String(x.cat).slice(0, 40),
            title: String(x.title || '').slice(0, 200),
            price: Math.round(Number(x.price) || 0),
            price_old: x.price_old ? Math.round(Number(x.price_old)) : null,
            origin: x.origin ? String(x.origin).slice(0, 40) : null,
            attrs: (x.attrs && typeof x.attrs === 'object') ? x.attrs : {},
            ts: Number(x.ts) || Date.now(),
          });
          merged++;
        }
      }
    } catch (e) { /* пир недоступен — пропускаем */ }
  }
  return merged;
}

module.exports = { store, publicItem, upsert, remove, getItem, list, stats, sync, pullPeers, DEFAULT_CATS };
