#!/usr/bin/env node
/**
 * build-expertise.mjs — builds one page per area of expertise.
 *
 * Source: content/expertise/<slug>.md (repo root, never published). Each file
 * has a front matter block, then the page body in a small Markdown subset:
 * "## Heading", "### Question" (only under "## Common questions"), "- item"
 * lists, **bold**, [text](/link/) and blank-line paragraphs.
 *
 * Output: site/expertise/<slug>/index.html, plus the links that point at it.
 *
 * DRAFT vs APPROVED — the front matter's `status:` line decides:
 *   status: draft     page is built with a visible DRAFT banner and noindex,
 *                     and nothing on the site links to it.
 *   status: approved  banner and noindex are dropped, and the page gets a
 *                     "Learn more about …" link in its /expertise/ row, the
 *                     home page list item points at it, and it is listed in
 *                     sitemap.xml.
 * The opening line (`description:`) is Dr. Harrington's own one-line copy and
 * must match her row on /expertise/ word for word.
 *
 * HOW TO RUN (from the project folder), then sync the shared header/footer:
 *     node tools/build-expertise.mjs && node tools/sync-partials.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'content', 'expertise');
const SITE = join(REPO, 'site');
const ORIGIN = 'https://theconciergegynecologist.com';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[(.+?)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');

function parse(file) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  for (const k of ['title', 'group', 'kind', 'status', 'description', 'meta']) {
    if (!meta[k]) throw new Error(`${file}: front matter needs "${k}"`);
  }
  meta.slug = file.replace(/\.md$/, '');
  meta.related = (meta.related || '').split(',').map((s) => s.trim()).filter(Boolean);
  meta.approved = meta.status === 'approved';

  // Body → sections of blocks; the "Common questions" section → FAQ items
  const sections = [];
  let cur = null;
  for (const block of m[2].trim().split(/\n{2,}/)) {
    const h2 = block.match(/^## (.+)$/);
    if (h2) { cur = { heading: h2[1].trim(), blocks: [] }; sections.push(cur); continue; }
    if (!cur) throw new Error(`${file}: text before the first "##" heading`);
    cur.blocks.push(block);
  }
  const faqIdx = sections.findIndex((s) => /^common questions$/i.test(s.heading));
  const faq = [];
  if (faqIdx >= 0) {
    let q = null;
    for (const block of sections[faqIdx].blocks) {
      const h3 = block.match(/^### (.+)$/);
      if (h3) { q = { q: h3[1].trim(), a: [] }; faq.push(q); } else if (q) q.a.push(block);
    }
    sections.splice(faqIdx, 1);
  }
  return { ...meta, sections, faq };
}

const renderBlock = (b) =>
  b.split('\n').every((l) => l.startsWith('- '))
    ? `<ul>\n${b.split('\n').map((l) => `            <li>${inline(l.slice(2))}</li>`).join('\n')}\n          </ul>`
    : `<p>${inline(b.replace(/\n/g, ' '))}</p>`;

function page(p, all) {
  const url = `${ORIGIN}/expertise/${p.slug}/`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'MedicalWebPage',
      name: `${p.title} — The Concierge Gynecologist`,
      url,
      description: p.meta,
      about: { '@type': p.kind, name: p.title },
      author: { '@id': `${ORIGIN}/dr-harrington/#lauren-harrington` },
      publisher: { '@id': `${ORIGIN}/#practice` },
      ...(p.approved ? { reviewedBy: { '@id': `${ORIGIN}/dr-harrington/#lauren-harrington` }, lastReviewed: p.reviewed || undefined } : {}),
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Expertise', item: `${ORIGIN}/expertise/` },
          { '@type': 'ListItem', position: 2, name: p.title, item: url },
        ],
      },
    },
    ...(p.faq.length ? [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.map(plain).join(' ') } })),
    }] : []),
  ];
  const related = p.related.map((s) => all.find((x) => x.slug === s)).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) — Google Analytics 4, G-NH5YB4F174 (added 21 Oct 2026).
       Public pages only: /admin/ is left out so admin visits are not counted. -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-NH5YB4F174"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-NH5YB4F174');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${p.approved ? '' : '  <!-- DRAFT: not yet reviewed by Dr. Harrington. Kept out of search and unlinked. -->\n  <meta name="robots" content="noindex, nofollow">\n'}
  <!-- Generated by tools/build-expertise.mjs from content/expertise/${p.slug}.md — edit the .md, not this file. -->
  <title>${esc(p.title)} — The Concierge Gynecologist</title>
  <meta name="description" content="${esc(p.meta)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#eae7d0">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="The Concierge Gynecologist">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(p.title)} — The Concierge Gynecologist">
  <meta property="og:description" content="${esc(p.meta)}">
  <meta property="og:image" content="${ORIGIN}/images/team/dr-lauren-harrington.jpg">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Instrument+Sans:wght@600&family=Instrument+Serif:ital@0;1&family=Jost:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="/styles.css">
  <script defer src="/script.js"></script>

  <script type="application/ld+json">
${JSON.stringify(ld.length === 1 ? ld[0] : ld, null, 2).split('\n').map((l) => '  ' + l).join('\n')}
  </script>
</head>
<body class="page-expertise-detail">
<!-- partial:header -->
<!-- /partial:header -->

<main id="main">
${p.approved ? '' : `  <div class="draft-banner" role="note">
    <div class="container"><strong>Draft</strong> — not yet reviewed by Dr. Harrington. This page is hidden from search and not linked from the site.</div>
  </div>
`}  <section class="page-hero">
    <div class="container">
      <div class="page-hero__inner">
        <p class="eyebrow"><a href="/expertise/">Expertise</a> <span aria-hidden="true">·</span> ${esc(p.group)}</p>
        <h1 class="title">${esc(p.title)}</h1>
        <p class="lede">${esc(p.description)}</p>
      </div>
    </div>
  </section>

  <article class="section section--flush-top detail" aria-label="${esc(p.title)}">
    <div class="container">
      <div class="detail__body prose">
${p.sections.map((s) => `        <h2 class="detail__heading">${inline(s.heading)}</h2>\n${s.blocks.map((b) => '          ' + renderBlock(b)).join('\n')}`).join('\n\n')}
      </div>
${p.faq.length ? `
      <div class="detail__faq">
        <h2 class="detail__heading">Common questions</h2>
        <div class="topic__list" data-hover-open>
${p.faq.map((f) => `          <details class="disclosure">
            <summary class="disclosure__summary">
              ${inline(f.q)}
              <span class="disclosure__icon" aria-hidden="true"></span>
            </summary>
            <div class="disclosure__body prose">
${f.a.map((b) => '              ' + renderBlock(b)).join('\n')}
            </div>
          </details>`).join('\n')}
        </div>
      </div>
` : ''}${related.length ? `
      <nav class="detail__related" aria-label="Related areas">
        <p class="eyebrow">Related</p>
        <ul>
${related.map((r) => `          <li><a class="text-link" href="/expertise/${r.slug}/">${esc(r.title)} <span aria-hidden="true">&rarr;</span></a></li>`).join('\n')}
        </ul>
      </nav>
` : ''}    </div>
  </article>

  <section class="section cta-band" data-parallax aria-labelledby="learn-more-title">
    <img class="cta-band__bg" data-parallax-layer src="/images/sections/learn-more.jpg" alt="" width="1400" height="2100" loading="lazy">
    <div class="container">
      <div class="section-intro section-intro--center">
        <h2 class="title" id="learn-more-title">Want to learn more?</h2>
        <div class="button-row">
          <a class="button" href="/stay-in-touch/" data-open-inquire="updates">Subscribe</a>
          <a class="button button--ghost" href="/inquire/" data-open-inquire>Get in touch</a>
        </div>
      </div>
    </div>
  </section>
</main>

<!-- partial:footer -->
<!-- /partial:footer -->

<!-- partial:inquire-panel -->
<!-- /partial:inquire-panel -->
</body>
</html>
`;
}

// ── Build ────────────────────────────────────────────────────────────────
const pages = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort().map(parse);
for (const p of pages) {
  mkdirSync(join(SITE, 'expertise', p.slug), { recursive: true });
  writeFileSync(join(SITE, 'expertise', p.slug, 'index.html'), page(p, pages.filter((x) => x.approved || !p.approved)));
}

// ── Links, for approved pages only ───────────────────────────────────────
const approved = new Set(pages.filter((p) => p.approved).map((p) => p.slug));

// /expertise/: a "Learn more" link at the end of each approved row
const listPath = join(SITE, 'expertise', 'index.html');
let list = readFileSync(listPath, 'utf8').replace(/\n\s*<p class="disclosure__more">.*?<\/p>/g, '');
for (const p of pages) {
  const row = new RegExp(`(<details class="disclosure" id="${p.slug}">[\\s\\S]*?<div class="disclosure__body prose">[\\s\\S]*?</p>)`);
  if (!row.test(list)) throw new Error(`/expertise/ has no row with id="${p.slug}"`);
  if (p.description !== plain(list.match(row)[1].replace(/[\s\S]*<p>/, '').replace(/<\/p>$/, '').replace(/&amp;/g, '&'))) {
    throw new Error(`${p.slug}: description does not match its /expertise/ row word for word`);
  }
  if (approved.has(p.slug)) {
    list = list.replace(row, `$1\n              <p class="disclosure__more"><a class="text-link" href="/expertise/${p.slug}/">Learn more about ${esc(p.title.toLowerCase())} <span aria-hidden="true">&rarr;</span></a></p>`);
  }
}
writeFileSync(listPath, list);

// Home page list: approved items go to their page, the rest to the /expertise/ row
const homePath = join(SITE, 'index.html');
let home = readFileSync(homePath, 'utf8');
for (const p of pages) {
  home = home.replace(new RegExp(`href="/expertise/(#${p.slug}|${p.slug}/)"`, 'g'), `href="/expertise/${approved.has(p.slug) ? `${p.slug}/` : `#${p.slug}`}"`);
}
writeFileSync(homePath, home);

// sitemap.xml: approved pages only
const mapPath = join(SITE, 'sitemap.xml');
let map = readFileSync(mapPath, 'utf8').replace(/\n\s*<url><loc>https:\/\/theconciergegynecologist\.com\/expertise\/[a-z-]+\/<\/loc><\/url>/g, '');
const entries = [...approved].sort().map((s) => `  <url><loc>${ORIGIN}/expertise/${s}/</loc></url>`).join('\n');
if (entries) map = map.replace('</urlset>', `${entries}\n</urlset>`);
writeFileSync(mapPath, map);

console.log(`${pages.length} expertise page(s) built: ${approved.size} approved, ${pages.length - approved.size} draft.`);
