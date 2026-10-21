/**
 * unsubscribe — marks a subscriber as unsubscribed in Resend Contacts.
 *
 * Two ways in, both POST:
 *   1. The /unsubscribe/ page's confirm button sends JSON { email, token }.
 *   2. One-click unsubscribe (RFC 8058) from Gmail, Apple Mail and others:
 *      they POST "List-Unsubscribe=One-Click" to the URL in the email's
 *      List-Unsubscribe header, which carries ?email=…&token=….
 * A plain GET does nothing: mail scanners open every link in a message, and a
 * GET that unsubscribed would sign people out of the list unasked. The email's
 * visible link goes to the /unsubscribe/ page instead, which asks first.
 *
 * The token is an HMAC of the email address, minted by submission-created.js
 * when it sends the welcome email, so a link only works for the address it was
 * sent to — nobody can unsubscribe someone else by editing the URL.
 *
 * ENVIRONMENT
 *   RESEND_API_KEY       required (also the default signing secret)
 *   UNSUBSCRIBE_SECRET   optional; signs tokens instead of the API key. Set it
 *                        before rotating the API key, or links already sent
 *                        stop working.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// Keep in step with unsubscribeToken() in submission-created.js
const tokenFor = (email, secret) =>
  createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('base64url').slice(0, 32);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const secret = process.env.UNSUBSCRIBE_SECRET?.trim() || apiKey;
  if (!apiKey) {
    console.error('unsubscribe: RESEND_API_KEY is missing');
    return json({ error: 'Unsubscribe is not available right now.' }, 500);
  }

  // One-click requests carry the address in the query string; the page sends JSON.
  const url = new URL(req.url);
  let email = url.searchParams.get('email') || '';
  let token = url.searchParams.get('token') || '';
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    try {
      const body = await req.json();
      email = body.email || email;
      token = body.token || token;
    } catch { /* fall through to the checks below */ }
  }

  email = String(email).trim().toLowerCase();
  const expected = email && tokenFor(email, secret);
  const valid = expected && token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!valid) return json({ error: 'This unsubscribe link is not valid.' }, 400);

  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  // Update the existing contact; if Resend has no contact for this address
  // (signed up before contacts were saved), create one already unsubscribed so
  // a later import can't put them back on the list.
  let res = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ unsubscribed: true }),
  });
  if (res.status === 404) {
    res = await fetch('https://api.resend.com/contacts', {
      method: 'POST', headers, body: JSON.stringify({ email, unsubscribed: true }),
    });
  }
  if (!res.ok) {
    console.error('unsubscribe: Resend', res.status, await res.text());
    return json({ error: 'Something went wrong. Please email contact@theconciergegynecologist.com.' }, 502);
  }

  return json({ ok: true, email });
};
