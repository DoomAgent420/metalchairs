// ============================================================
//  backend.js — Node.js/Express fallback proxy
//  Kicks in when the Cloudflare Worker is down / rate-limited.
//
//  Deploy to: Render, Railway, Fly.io, or any Node host.
//  npm install express node-fetch@2 compression
//  node backend.js
// ============================================================

const express    = require('express');
const nodeFetch  = require('node-fetch');
const compression = require('compression');

const PORT         = process.env.PORT || 3000;
const SELF_URL     = process.env.SELF_URL || `http://localhost:${PORT}/api`;

const app = express();
app.use(compression());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// ── CORS ──────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
};

app.use((req, res, next) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Strip headers ─────────────────────────────────────────────
const STRIP_RES = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-xss-protection',
  'report-to',
  'nel',
  'content-encoding', // node-fetch already decompresses
]);

// ── Main proxy route ──────────────────────────────────────────
app.all('/api', async (req, res) => {
  const targetParam = req.query.url;
  if (!targetParam) return res.status(400).json({ error: 'Missing ?url= parameter' });

  let target;
  try {
    target = new URL(decodeURIComponent(targetParam));
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const cleanHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    Connection: 'keep-alive',
    // Omit: Referer, Origin, Cookie, X-Forwarded-For
  };

  const fetchOpts = {
    method: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.method : 'GET',
    headers: cleanHeaders,
    redirect: 'follow',
    timeout: 15000,
  };
  if (req.body && req.body.length) fetchOpts.body = req.body;

  let upstream;
  try {
    upstream = await nodeFetch(target.toString(), fetchOpts);
  } catch (err) {
    return res.status(502).json({ error: `Fetch failed: ${err.message}` });
  }

  const ct = upstream.headers.get('content-type') || '';

  // Copy non-stripped upstream headers
  upstream.headers.forEach((value, key) => {
    if (STRIP_RES.has(key.toLowerCase())) return;
    try { res.setHeader(key, value); } catch {}
  });
  // Re-apply CORS after copying upstream headers
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', ct || 'application/octet-stream');

  if (ct.includes('text/html')) {
    const html = await upstream.text();
    return res.send(rewriteHtml(html, target.toString()));
  }

  if (ct.includes('text/css')) {
    const css = await upstream.text();
    return res.send(rewriteCss(css, target.toString()));
  }

  upstream.body.pipe(res);
});

app.listen(PORT, () =>
  console.log(`[backend] Fallback proxy running on port ${PORT}`)
);

// ── URL rewriting (mirrors worker.js logic) ──────────────────

function px(url, base) {
  if (!url) return url;
  const u = String(url).trim();
  if (
    !u ||
    u[0] === '#' ||
    /^(javascript|data|blob|mailto|tel):/.test(u) ||
    u.startsWith(SELF_URL)
  ) return url;
  try {
    const abs = new URL(u, base).toString();
    return `${SELF_URL}?url=${encodeURIComponent(abs)}`;
  } catch {
    return url;
  }
}

function rewriteHtml(html, base) {
  html = html.replace(
    /<meta[^>]+http-equiv\s*=\s*["'](content-security-policy|x-frame-options)["'][^>]*\/?>/gi,
    ''
  );

  html = html.replace(
    /(\s(?:src|href|action|data-src|data-href|data-original))\s*=\s*(["'])([^"']*)\2/gi,
    (_, attr, q, url) => {
      if (attr.trim() === 'href' && (url[0] === '#' || url.startsWith('javascript:')))
        return `${attr}=${q}${url}${q}`;
      return `${attr}=${q}${px(url, base)}${q}`;
    }
  );

// In rewriteHtml(), after the CSP/XFO strip:
html = html.replace(/<link[^>]+rel\s*=\s*["']preload["'][^>]*>/gi, '');
    const rw = srcset.split(',').map(part => {
      const t = part.trim(), sp = t.search(/\s/);
      return sp === -1 ? px(t, base) : px(t.slice(0, sp), base) + t.slice(sp);
    }).join(', ');
    return `${attr}=${q}${rw}${q}`;
  };

  html = html.replace(/url\((["']?)([^)"']+)\1\)/gi, (m, q, url) => {
    if (url.startsWith('data:')) return m;
    return `url(${q}${px(url, base)}${q})`;
  });

  const runtime = buildRuntime(base);
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/(<head[\s>][^>]*>)/i, `$1${runtime}`);
  } else {
    html = runtime + html;
  }
  return html;


function rewriteCss(css, base) {
  return css.replace(/url\((["']?)([^)"']+)\1\)/gi, (m, q, url) => {
    if (url.startsWith('data:')) return m;
    return `url(${q}${px(url, base)}${q})`;
  });
}

function buildRuntime(base) {
  return `<script id="__pxy__">
(function(){
var P='${SELF_URL}?url=';var B='${base}';
function px(u){if(!u)return u;u=String(u).trim();
  if(!u||u[0]==='#'||/^(javascript|data|blob|mailto|tel):/.test(u)||u.startsWith(P))return u;
  try{return P+encodeURIComponent(new URL(u,B).toString());}catch(e){return u;}}
var _f=window.fetch;
window.fetch=function(i,o){if(typeof i==='string')i=px(i);return _f.call(this,i,o);};
var _x=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){arguments[1]=px(u);return _x.apply(this,arguments);};
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');if(!a)return;
  var h=a.getAttribute('href');if(!h||h[0]==='#'||h.startsWith('javascript:'))return;
  e.preventDefault();e.stopPropagation();
  try{window.top.postMessage({type:'__pxy_nav__',url:new URL(h,B).toString()},'*');}catch(_){}
},true);
document.addEventListener('submit',function(e){
  var f=e.target;
  try{if(f.action&&!f.action.startsWith(P))f.action=px(new URL(f.action,B).toString());}catch(_){}
},true);
})();
</script>`;
}
