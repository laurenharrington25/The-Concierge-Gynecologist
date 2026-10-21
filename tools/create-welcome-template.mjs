#!/usr/bin/env node
/**
 * create-welcome-template.mjs — puts the subscriber welcome email into Resend
 * as an editable, published template (alias "welcome").
 *
 * Once it exists, netlify/functions/submission-created.js sends the welcome
 * email from this template, so its wording and design can be changed in
 * Resend → Templates without touching code. The HTML built into that function
 * stays as the fallback if the template is ever missing.
 *
 * HOW TO RUN (once, from the project folder, in your own Terminal)
 *     node tools/create-welcome-template.mjs
 * It asks for the Resend API key with the typing hidden; the key is used for
 * this one request and never written anywhere. Running it again when the
 * template already exists changes nothing — edit it in Resend instead.
 *
 * Uses Resend's REST API directly (the same calls as resend.templates.create
 * and .publish in their SDK), so the site needs no npm packages.
 */

const API = 'https://api.resend.com';

// Template variables, filled in per subscriber by submission-created.js.
// Triple braces insert the value as-is; the function escapes the name first.
const variables = [
  { key: 'FIRST_NAME', type: 'string', fallback_value: 'there' },
  { key: 'UNSUBSCRIBE_URL', type: 'string', fallback_value: 'https://theconciergegynecologist.com/unsubscribe/' },
];

// Same design as the fallback in submission-created.js; keep them in step.
const html = `<div style="font-family:Georgia,serif;color:#1f1711;max-width:520px;line-height:1.7">
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#716862">
    The Concierge Gynecologist
  </p>
  <p>Hello {{{FIRST_NAME}}},</p>
  <p>Thank you for signing up. You'll hear from us occasionally with new
     partnerships, availability, and practice news &mdash; nothing more.</p>
  <p>If you have a question in the meantime, simply reply to this note.</p>
  <p style="margin-top:28px">Warmly,<br>Lauren Harrington, MD</p>
  <p style="font-size:12px;color:#716862;margin-top:32px">
    This message is for general information and is not medical advice.
  </p>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#716862">
    You are receiving this because you subscribed at theconciergegynecologist.com.
    <a href="{{{UNSUBSCRIBE_URL}}}" style="color:#716862">Unsubscribe</a>
  </p>
</div>`;

/** Read a line from the terminal without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(value.trim());
        }
        if (ch === '\u0003') process.exit(130); // Ctrl-C
        if (ch === '\u007f') value = value.slice(0, -1); // Backspace
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const key = process.env.RESEND_API_KEY?.trim() || await askHidden('Resend API key (hidden): ');
if (!key.startsWith('re_')) {
  console.error('That does not look like a Resend API key (they start with "re_").');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const existing = await fetch(`${API}/templates/welcome`, { headers });
if (existing.ok) {
  const t = await existing.json();
  console.log(`A "welcome" template already exists (${t.status}). Nothing changed — edit it in Resend → Templates.`);
  process.exit(0);
}

const created = await fetch(`${API}/templates`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Welcome email',
    alias: 'welcome',
    subject: 'Welcome — The Concierge Gynecologist',
    from: 'The Concierge Gynecologist <contact@theconciergegynecologist.com>',
    html,
    variables,
  }),
});
if (!created.ok) {
  console.error(`Could not create the template: ${created.status} ${await created.text()}`);
  process.exit(1);
}
const { id } = await created.json();

const published = await fetch(`${API}/templates/${id}/publish`, { method: 'POST', headers });
if (!published.ok) {
  console.error(`Created template ${id} but could not publish it: ${published.status} ${await published.text()}`);
  console.error('Publish it in Resend → Templates; the site sends only published templates.');
  process.exit(1);
}

console.log(`Done. "Welcome email" (alias: welcome, id: ${id}) is created and published.`);
console.log('New sign-ups will now get it. Edit it any time in Resend → Templates, then click Publish.');
