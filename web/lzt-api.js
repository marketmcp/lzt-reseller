/* ════════════════════════════════════════════════════════════════════════
   LZT MARKET — клиент (через безопасный бэкенд-прокси)
   ════════════════════════════════════════════════════════════════════════
   ВАЖНО про безопасность: токен LZT — секрет и НЕ должен быть в браузере.
   Поэтому этот клиент ходит не напрямую в LZT, а в наш бэкенд: /api/lzt/...
   Бэкенд (server/index.js) сам подставляет Authorization: Bearer <LZT_TOKEN>
   из переменной окружения. Токен в браузер не попадает никогда.

   Демо работает на сид-данных (PRODUCTS в index.html). Чтобы включить
   живой режим, задайте LZT_TOKEN в .env на сервере и вызовите:
       LZT.goLive({ categories:['steam','discord'], currency:'rub' })

   Эндпоинты и параметры сверены с офиц. докой lzt-market.readme.io.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const BASE = '/api/lzt';   // бэкенд-прокси (тот же origin)

  function qs(params) {
    const p = Object.entries(params || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => Array.isArray(v)
        ? v.map(x => `${encodeURIComponent(k)}[]=${encodeURIComponent(x)}`).join('&')
        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return p ? '?' + p : '';
  }

  async function call(method, path, { params, body } = {}) {
    const opts = { method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(BASE + path + (method === 'GET' ? qs(params) : ''), opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.demo) throw new Error('demo_mode');          // бэкенд без LZT_TOKEN
    if (res.status === 403) throw new Error('нужна авторизация владельца');
    if (!res.ok) throw new Error('LZT ' + res.status + ': ' + JSON.stringify(data.errors || data.error || data));
    return data;
  }

  // ── Каталог ──
  function getCategories() { return call('GET', '/category'); }
  function getCategoryParams(category) { return call('GET', `/category/${category}/params`); }

  // ── Листинг товаров ── GET /{category}; фильтры см. getCategoryParams()
  //   Steam: lmin/lmax (уровень), gmin/gmax (игр), pmin/pmax (цена),
  //   no_vac, mafile, rmin/rmax (ранг CS2), trade_ban, order_by, page …
  function listItems(category, filters = {}) { return call('GET', `/${category}`, { params: filters }); }

  // ── Покупка ── POST /{id}/fast-buy { price, balance_id } (на прокси — только владелец)
  function fastBuy(itemId, price, balanceId) { return call('POST', `/${itemId}/fast-buy`, { body: { price, balance_id: balanceId } }); }
  // ── Данные купленного аккаунта ──
  function getMafile(itemId) { return call('GET', `/${itemId}/mafile`); }                       // Steam maFile (снимает гарантию!)
  function getLetters(itemId, limit = 10) { return call('GET', `/${itemId}/letters`, { params: { limit: Math.max(10, Math.min(50, limit)) } }); } // коды с почты
  function getOrders(params = {}) { return call('GET', '/list', { params }); }

  // ── Маппинг LZT item → форма PRODUCTS витрины ──
  function mapItem(it, category) {
    return {
      id: it.item_id, cat: category,
      title: it.title || it.title_en || `${category} #${it.item_id}`,
      price: Math.round(it.price_with_seller_fee || it.price || 0),
      oldPrice: it.price_old ? Math.round(it.price_old) : null,
      si: 4.8,
      tags: [it.account_origin].filter(Boolean),
      flags: [],
      desc: it.description || it.information || '',
      det: Object.entries(it.account_data || it.params || {}).slice(0, 12).map(([l, v]) => ({ l, v: String(v), c: '' })),
      _raw: it,
    };
  }

  // ── Включение живого режима ──
  async function goLive(opts = {}) {
    const cats = opts.categories || ['steam', 'fortnite', 'discord', 'telegram', 'epicgames', 'riot', 'minecraft', 'roblox'];
    const all = [];
    for (const c of cats) {
      try {
        const r = await listItems(c, { page: 1, currency: opts.currency || 'rub' });
        (r.items || []).forEach(it => all.push(mapItem(it, c)));
      } catch (e) { console.warn(`[LZT] ${c}:`, e.message); }
    }
    if (all.length) {
      global.PRODUCTS = all;
      if (typeof applyConfig === 'function') applyConfig();
      if (typeof renderNav === 'function') renderNav();
      if (typeof renderSidebar === 'function') renderSidebar('all');
      if (typeof filterProducts === 'function') filterProducts();
    } else {
      console.warn('[LZT] Живой режим не вернул товаров. Проверьте LZT_TOKEN на сервере и категории.');
    }
    return all.length;
  }

  global.LZT = { goLive, getCategories, getCategoryParams, listItems, fastBuy, getMafile, getLetters, getOrders, mapItem };
})(window);
