/**
 * submission-created — fires automatically whenever a Netlify form is
 * submitted. Sends the welcome email for the "updates" (Stay in touch) form
 * through Resend, and ignores every other form.
 *
 * REQUIRED ENVIRONMENT VARIABLE
 *   RESEND_API_KEY   from resend.com → API Keys (scope must include Functions)
 *
 * OPTIONAL
 *   RESEND_FROM      sender; defaults to
 *                    "The Concierge Gynecologist <contact@theconciergegynecologist.com>".
 *                    Either way its domain must be verified in Resend.
 *   RESEND_AUDIENCE_ID  the Resend audience new subscribers are saved to as
 *                       contacts; without it they go to the account's contacts
 *
 * Event-triggered functions use the classic handler signature.
 */

exports.handler = async (event) => {
  let payload = {};
  try { payload = JSON.parse(event.body).payload || {}; } catch { return { statusCode: 400, body: 'Bad payload' }; }

  const formName = payload.form_name;
  if (formName !== 'updates') return { statusCode: 200, body: `Ignored form: ${formName}` };

  const email = payload.data?.email;
  const name = (payload.data?.name || '').trim();
  if (!email) return { statusCode: 200, body: 'No email address on submission' };

  // RESEND_FROM falls back to the practice address, so only the key is
  // required; the domain must still be verified in Resend for mail to send.
  const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
  const RESEND_FROM = process.env.RESEND_FROM?.trim()
    || 'The Concierge Gynecologist <contact@theconciergegynecologist.com>';
  if (!RESEND_API_KEY) {
    // Name the variables this function *can* see (names only, never values),
    // so a near-miss spelling or a scope that leaves out Functions shows up
    // in the log instead of a bare "not configured".
    const seen = Object.keys(process.env).filter((k) => /resend/i.test(k));
    console.error(`Resend is not configured: RESEND_API_KEY is missing. Resend-like variables visible to this function: ${seen.length ? seen.join(', ') : 'none'}`);
    return { statusCode: 500, body: 'Resend not configured' };
  }

  const greeting = name ? `Hello ${name.split(' ')[0]},` : 'Hello,';
  const html = `
    <div style="font-family:Georgia,serif;color:#1f1711;max-width:520px;line-height:1.7">
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#716862">
        The Concierge Gynecologist
      </p>
      <p>${greeting}</p>
      <p>Thank you for signing up. You'll hear from us occasionally with new
         partnerships, availability, and practice news &mdash; nothing more.</p>
      <p>If you have a question in the meantime, simply reply to this note.</p>
      <p style="margin-top:28px">Warmly,<br>Lauren Harrington, MD</p>
      <p style="font-size:12px;color:#716862;margin-top:32px">
        This message is for general information and is not medical advice.
      </p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email],
      subject: 'Welcome — The Concierge Gynecologist',
      html,
    }),
  });

  // Save the subscriber as a Resend contact too, so newsletters can be sent
  // from Resend later. A failure here is logged but never blocks the welcome
  // email, which has already gone. With RESEND_AUDIENCE_ID set, the contact
  // goes into that audience; without it, into the account's contacts.
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  const { RESEND_AUDIENCE_ID } = process.env;
  const contactUrl = RESEND_AUDIENCE_ID
    ? `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`
    : 'https://api.resend.com/contacts';
  const contactRes = await fetch(contactUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      first_name: firstName || undefined,
      last_name: rest.join(' ') || undefined,
      unsubscribed: false,
    }),
  });
  if (!contactRes.ok) console.error('Resend contact not saved', contactRes.status, await contactRes.text());

  if (!res.ok) {
    const detail = await res.text();
    console.error('Resend failed', res.status, detail);
    return { statusCode: 502, body: `Resend error ${res.status}` };
  }
  return { statusCode: 200, body: `Welcome email sent to ${email}${contactRes.ok ? '; contact saved' : ''}` };
};
