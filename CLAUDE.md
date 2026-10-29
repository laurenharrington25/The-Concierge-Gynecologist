# Project instructions

- Read `BRAND-GUIDE.md` before any change. It is the source of truth for colors, type, components, page content, and conventions.
- Plain static HTML/CSS/JS, no build step. **The published site lives in `site/`** (Netlify publishes only that folder); each page is `site/<slug>/index.html`. Never put working documents, notes or guides inside `site/` — anything there is public.
- Header, footer, and Inquire panel live in `partials/`. Never edit them inside a page; edit the partial and run `node tools/sync-partials.mjs`.
- Use CSS tokens from the top of `site/styles.css`; never hard-code hex values.
- Preview with `npx serve site` (config in `.claude/launch.json`).
