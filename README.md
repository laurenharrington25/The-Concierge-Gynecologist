# The Concierge Gynecologist

Website for Dr. Lauren Harrington, MD: boutique gynecology care delivered on-site at concierge primary care practices in Denver.

**Start with [BRAND-GUIDE.md](BRAND-GUIDE.md).** It covers the brand, design system, page specs, and technical standards.

## Run locally

```bash
npx serve site
```

Open http://localhost:3000.

## Edit shared header / footer / Inquire panel

Edit files in `partials/`, then:

```bash
node tools/sync-partials.mjs
```

## Deploy

Static site on Netlify, publish directory **`site/`**, no build command. Pushing to `main` deploys.

**Only `site/` is public.** Put pages, CSS/JS, images and videos there. Everything at the repo root — this README, `BRAND-GUIDE.md`, `docs/`, `partials/`, `tools/`, `netlify/` — is working material and is never published.
