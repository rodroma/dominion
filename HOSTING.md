# Hosting

Dominion Search is **100% static**. There is no server, database, or runtime
API — the client ships an in-memory query engine and a ~28 KB (brotli) dataset.

## What the host must do

- Serve the `public/` directory over HTTPS (required for the service worker;
  `localhost` is exempt).
- ~230 KB transferred on first load, then **offline** via the service worker.
- No redirects/rewrites needed (single page; the shell is served at `/`).
- Card images load at runtime from the wiki
  (`dominionstrategy.miraheze.org/wiki/Special:FilePath/...`). That's
  hotlinking — fine for personal use, but see *Images* below.

Build the site with:

```bash
npm ci
npm run build:site     # npm run build && npm run compile && assemble public/
```

…and publish **`public/`**.

## Comparison

| Host | Free tier | Build in CI | PR previews | Custom headers | Notes |
|------|-----------|-------------|-------------|----------------|-------|
| **Cloudflare Pages** | unlimited reqs + bandwidth | yes | yes | yes (`_headers`) | best free option; fast global edge |
| **GitHub Pages** | 1 GB site, ~100 GB/mo | via Actions | no | no | zero extra accounts; repo already here |
| **Netlify** | 100 GB/mo, 300 build-min/mo | yes | yes | yes (`_headers`) | great DX; slower in some regions |
| **Vercel** | 100 GB/mo (Hobby = non-commercial) | yes | yes | yes | framework-oriented; overkill here |
| **S3 + CloudFront** | 12-mo free, then pay | no | no | yes | full control; set up IAM/TLS/CDN |
| **Backblaze B2 + Cloudflare** | 10 GB storage, free egress *to* CF | no | no | yes | cheap origin; good if you mirror images |
| **R2 + CDN** | 10 GB, no egress fees | no | no | yes | S3-compatible, no egress cost |
| **Caddy/nginx on a VPS** | — (you pay) | no | no | yes | only if you already run a box |

### Cloudflare Pages — recommended

Free, **unlimited bandwidth**, global edge, per-PR previews, custom headers.

**Connect via the dashboard (Git integration):**

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick `rodroma/dominion`.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build:site`
   - **Build output directory:** `public`
   - **Environment variables:** `NODE_VERSION` = `22` (optional; the build
     runs compiled JS, so any Node ≥ 18 works)
3. Save and deploy. Every push to `main` redeploys; PRs get preview URLs.

**Or deploy from the CLI** (no Git integration):

```bash
npm run build:site
npx wrangler pages deploy public --project-name dominion
```

**Caching & headers** are handled by `app/_headers`, which `build:site` copies
to `public/_headers`: content-hashed assets get
`Cache-Control: public, max-age=31536000, immutable`; the app shell, `sw.js`
and the unhashed `data/bundle.json` revalidate so updates land.

**Config files:** `wrangler.toml` sets the project name and
`pages_build_output_dir = "public"` (used by the CLI and recognized by the
dashboard).

Custom domain + automatic HTTPS are available in the project settings.

### GitHub Pages

- Simplest if you want everything in one place; no third-party account.
- Pages can't run a build, so either (a) add a small GitHub Actions workflow
  that runs `npm run build:site` and deploys `public/`, or (b) run
  `build:site` locally and commit `public/` (then set Pages to that folder).
- **No custom headers**, so you can't mark the hashed bundle immutable; the
  service worker compensates by caching everything anyway.
- Public repo required for free Pages.

### Netlify

- Same shape as Cloudflare Pages (`_headers`, `_redirects`, PR previews).
- Only meaningful downside vs Cloudflare is the metered 100 GB/mo and fewer
  POPs. Great if you already use it.

### Vercel

- Excellent DX, but the free *Hobby* tier is **non-commercial use only** and
  the platform is aimed at frameworks/functions we don't use. Skip unless you
  already live there.

### Object storage + CDN (S3, R2, B2)

- Best when you want **control**: set immutable cache headers, mirror the card
  images into your own bucket, and serve everything from one origin.
- Costs are trivial at this scale (a few hundred KB + images), and R2/B2 have
  no egress fees. More setup (bucket policy, TLS, CDN, a deploy script).
- Good "later" step if the wiki hotlinking becomes a problem.

### Self-hosted (Caddy/nginx)

- Only worth it if you already run a VPS. You get full control of headers and
  caching, at the cost of managing TLS and uptime for a static site.

## Images

Images are the only external dependency and the bulk of the bytes (originals
are 570–750 KB; thumbnails via `?width=N` are 12–35 KB). Two options:

1. **Hotlink** the wiki's `Special:FilePath` (current behaviour) — zero
   storage, but depends on Miraheze's availability and hotlinking policy.
2. **Mirror** thumbnails into a bucket/CDN and point `imgUrl()` in
   `app/app.js` at it — one-line change, removes the external dependency.

## Caching notes

Data is static and immutable, so aggressive caching is safe. The bundle is
content-hashed (`data/bundle.<sha>.json{.br}`); if a host can't set headers,
the service worker still makes repeat loads instant and offline. Bump
`VERSION` in `app/sw.js` whenever shell files change to invalidate old caches.
