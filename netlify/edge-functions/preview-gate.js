/**
 * preview-gate — keeps the site private until launch.
 *
 * Runs on Netlify's edge in front of every page. While the SITE_PASSWORD
 * environment variable is set, anyone without a valid access cookie gets a
 * branded "Coming soon" page with a password box instead of the site; a right
 * password sets a 30-day cookie and sends them on to the page they asked for.
 * Search engines see only that page, marked noindex.
 *
 * SEVERAL PEOPLE, SEVERAL PASSWORDS: SITE_PASSWORD may hold more than one
 * password, separated by commas (e.g. "lauren-pass, team-pass, guest-pass").
 * Any of them lets you in. Removing one from the list signs out only the
 * people who used it; everyone else stays signed in.
 *
 * TO LAUNCH: delete SITE_PASSWORD in Netlify (Site configuration →
 * Environment variables) and redeploy. With it unset, this function steps
 * aside and the site is public.
 *
 * Left reachable on purpose (see config.excludedPath below):
 *   /unsubscribe/ and /.netlify/functions/*  — welcome-email subscribers must
 *     always be able to unsubscribe; the forms, admin data and unsubscribe all
 *     run through functions.
 *   /styles.css, /script.js  — the unsubscribe page needs them to work.
 *   /images/logos/*, /favicon.svg  — the gate page and unsubscribe page use them.
 *
 * Built on Edge Functions because they're on Netlify's free plan; the
 * built-in site password needs a paid plan.
 */

const COOKIE = 'tcg_preview';
const LOGIN_PATH = '/__preview-login';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

/** Cookie value for one password: an HMAC keyed by it, so a cookie only works
 *  while that password is still on the list and can't be forged without it. */
async function accessToken(password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('tcg-preview-access-v1'));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string comparison. */
function same(a = '', b = '') {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const readCookie = (req, name) =>
  (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];

/** Only send people back to a path on this site. */
const safeReturn = (to) => (typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') ? to : '/');

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gatePage({ returnTo, error }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Coming soon — The Concierge Gynecologist</title>
  <meta name="theme-color" content="#322217">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600&family=Instrument+Serif&family=Jost:wght@400;500&display=swap">
  <style>
    /* Self-contained so the gate never depends on the (gated) site styles.
       Colours are the brand tokens: Dark Walnut #322217, Ivory Porcelain #eae7d0. */
    *, *::before, *::after { box-sizing: border-box; margin: 0; }
    body {
      min-height: 100svh; display: grid; place-items: center; padding: 48px 20px;
      background: #322217; color: #eae7d0;
      font-family: "Jost", "Helvetica Neue", Arial, sans-serif; font-size: 1.0625rem; line-height: 1.7;
      -webkit-font-smoothing: antialiased; text-align: center;
    }
    main { width: min(440px, 100%); }
    .logo {
      display: block; width: min(300px, 80%); aspect-ratio: 749.91 / 235.47; margin: 0 auto 48px;
      background: #eae7d0;
      -webkit-mask: url("/images/logos/main-logo.svg") center / contain no-repeat;
      mask: url("/images/logos/main-logo.svg") center / contain no-repeat;
      text-indent: 110%; white-space: nowrap; overflow: hidden;
    }
    .eyebrow { font-family: "Instrument Sans", "Helvetica Neue", Arial, sans-serif; font-weight: 600; font-size: .75rem; letter-spacing: .2em; text-transform: uppercase; }
    h1 { margin-top: 14px; font-family: "Instrument Serif", "Times New Roman", serif; font-weight: 400; font-size: clamp(2.5rem, 8vw, 3.5rem); line-height: 1.05; }
    p.lede { margin-top: 14px; color: rgba(234, 231, 208, .82); }
    form { margin-top: 36px; display: grid; gap: 14px; text-align: left; }
    label { font-family: "Instrument Sans", "Helvetica Neue", Arial, sans-serif; font-weight: 600; font-size: .6875rem; letter-spacing: .16em; text-transform: uppercase; }
    input {
      width: 100%; padding: 12px 0; border: 0; border-bottom: 1px solid rgba(234, 231, 208, .45); border-radius: 0;
      background: transparent; color: #eae7d0; font: inherit;
    }
    input:focus { outline: none; border-color: #eae7d0; box-shadow: 0 1px 0 #eae7d0; }
    button {
      margin-top: 10px; min-height: 48px; border: 1px solid #eae7d0; border-radius: 4px; background: #eae7d0; color: #322217; cursor: pointer;
      font-family: "Instrument Sans", "Helvetica Neue", Arial, sans-serif; font-weight: 600; font-size: .75rem; letter-spacing: .16em; text-transform: uppercase;
    }
    button:hover { background: #e8d2c6; border-color: #e8d2c6; }
    :focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
    .error { color: #e8d2c6; font-size: .9375rem; }
  </style>
</head>
<body>
  <main>
    <span class="logo" role="img" aria-label="The Concierge Gynecologist">The Concierge Gynecologist</span>
    <p class="eyebrow">Coming soon</p>
    <h1>Boutique gynecology care.</h1>
    <p class="lede">Our website is almost ready. If you have the preview password, enter it below.</p>
    <form method="POST" action="${LOGIN_PATH}">
      <input type="hidden" name="return" value="${escapeHtml(returnTo)}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      ${error ? '<p class="error" role="alert">That password isn’t right. Please try again.</p>' : ''}
      <button type="submit">Enter</button>
    </form>
  </main>
</body>
</html>`;
}

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });

export default async (req, context) => {
  const passwords = (Netlify.env.get('SITE_PASSWORD') || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!passwords.length) return context.next(); // no password set: the site is public

  const url = new URL(req.url);
  const tokens = await Promise.all(passwords.map(accessToken));

  if (url.pathname === LOGIN_PATH) {
    if (req.method !== 'POST') return Response.redirect(new URL('/', url), 303);
    const form = await req.formData();
    const returnTo = safeReturn(form.get('return'));
    const entered = String(form.get('password') || '').trim();
    const match = passwords.findIndex((p) => same(entered, p));
    if (match < 0) {
      await new Promise((r) => setTimeout(r, 600)); // blunt guessing
      return html(gatePage({ returnTo, error: true }), 401);
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: returnTo,
        'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${tokens[match]}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const cookie = readCookie(req, COOKIE) || '';
  if (tokens.some((t) => same(cookie, t))) {
    // Signed in. Keep the private site out of shared caches.
    const res = await context.next();
    res.headers.set('cache-control', 'private, no-store');
    return res;
  }

  return html(gatePage({ returnTo: url.pathname + url.search }), 401);
};

export const config = {
  path: '/*',
  excludedPath: [
    '/unsubscribe', '/unsubscribe/*', '/.netlify/functions/*',
    // The unsubscribe page needs the site's stylesheet and script to work;
    // neither holds anything private.
    '/styles.css', '/script.js', '/images/logos/*', '/favicon.svg',
  ],
};
