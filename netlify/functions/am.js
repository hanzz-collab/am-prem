const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

const BASE = 'https://am-proaktif.vercel.app';
const PROXY_API = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&protocol=socks5&timeout=5000';

// Cache proxies di memori antar invocation (kalau function reuse)
let cachedProxies = null;
let cachedAt = 0;
const PROXY_TTL = 5 * 60 * 1000; // 5 menit

async function fetchProxies() {
  const now = Date.now();
  if (cachedProxies && now - cachedAt < PROXY_TTL) return cachedProxies;

  return new Promise((resolve) => {
    const req = https.get(PROXY_API, { timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const lines = Buffer.concat(chunks).toString()
            .split('\n').map(l => l.trim()).filter(Boolean);
          const list = lines.map(l => {
            const m = l.match(/([\d.]+):(\d+)/);
            return m ? `socks5://${m[1]}:${m[2]}` : null;
          }).filter(Boolean);
          cachedProxies = list;
          cachedAt = Date.now();
          resolve(list);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function post(body, proxyUrl) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const agent = proxyUrl ? new SocksProxyAgent(proxyUrl, { timeout: 4000 }) : undefined;

    const options = {
      hostname: 'am-proaktif.vercel.app',
      path: '/api/am.js',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36',
        'Referer': `${BASE}/`,
        'Origin': BASE,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 6000,
      ...(agent ? { agent } : {})
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          resolve({ status: res.statusCode, data: { ok: false, message: 'Response tidak valid' } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

function isCooldown(msg = '') {
  const m = String(msg).toLowerCase();
  return m.includes('cooldown') || m.includes('tunggu') || m.includes('limit');
}

async function postWithRetry(body, maxTry = 3) {
  // Attempt 1: direct (no proxy)
  try {
    const res = await post(body, null);
    if (res.data?.ok) return res;
    if (!isCooldown(res.data?.message)) return res;
  } catch {
    // fallthrough ke proxy
  }

  // Attempt 2..N: pakai proxy
  const proxies = await fetchProxies();
  if (!proxies.length) {
    return { status: 503, data: { ok: false, message: 'Tidak ada proxy tersedia saat ini.' } };
  }

  let lastErr = null;
  for (let i = 0; i < maxTry; i++) {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    try {
      const res = await post(body, proxy);
      if (res.data?.ok) return res;
      if (!isCooldown(res.data?.message)) return res;
      lastErr = res;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr && lastErr.data) return lastErr;
  return { status: 503, data: { ok: false, message: 'Semua proxy gagal / cooldown. Coba lagi nanti.' } };
}

// ==== Handlers ====
async function sendMagicLink(email) {
  if (!email) return { ok: false, message: 'Email wajib diisi.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'Format email tidak valid.' };
  }
  try {
    const res = await postWithRetry({ action: 'send', email });
    if (res.data?.ok) {
      return { ok: true, message: `Magic link berhasil dikirim ke ${email}.` };
    }
    return { ok: false, message: res.data?.message || res.data?.error || 'Gagal mengirim magic link.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function verifyMagicLink(email, link) {
  if (!email || !link) return { ok: false, message: 'Email dan Link wajib diisi.' };
  try {
    const res = await postWithRetry({ action: 'verify', email, link });
    return {
      ok: res.data?.ok ?? false,
      message: res.data?.message || res.data?.error || (res.data?.ok ? 'Verifikasi berhasil!' : 'Verifikasi gagal.'),
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ==== Netlify Handler ====
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, message: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, message: 'Body bukan JSON valid.' }) };
  }

  const { action, email, link } = body;

  try {
    let result;
    if (action === 'send') {
      result = await sendMagicLink(email);
    } else if (action === 'verify') {
      result = await verifyMagicLink(email, link);
    } else {
      result = { ok: false, message: 'Action tidak valid. Gunakan: send / verify.' };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, message: err.message || 'Internal error' }) };
  }
};
