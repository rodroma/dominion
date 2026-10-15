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
| **Cloudflare Workers** (static assets) | unlimited reqs + bandwidth | yes | yes (Worker Previews) | yes (`_headers`) | best free option; fast global edge |
| **Cloudflare Pages** (classic) | unlimited reqs + bandwidth | yes | yes | yes (`_headers`) | older flow; Workers is the current default |
| **GitHub Pages** | 1 GB site, ~100 GB/mo | via Actions | no | no | zero extra accounts; repo already here |
| **Netlify** | 100 GB/mo, 300 build-min/mo | yes | yes | yes (`_headers`) | great DX; slower in some regions |
| **Vercel** | 100 GB/mo (Hobby = non-commercial) | yes | yes | yes | framework-oriented; overkill here |
| **S3 + CloudFront** | 12-mo free, then pay | no | no | yes | full control; set up IAM/TLS/CDN |
| **Backblaze B2 + Cloudflare** | 10 GB storage, free egress *to* CF | no | no | yes | cheap origin; good if you mirror images |
| **R2 + CDN** | 10 GB, no egress fees | no | no | yes | S3-compatible, no egress cost |
| **Caddy/nginx on a VPS** | — (you pay) | no | no | yes | only if you already run a box |

### Cloudflare Workers (static assets) — recommended

Free, **unlimited bandwidth**, global edge, previews per branch, custom headers.

**Connect via the dashboard:**

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Connect to Git**
   → pick `rodroma/dominion`.
2. Fill the build settings:

   | Field | Value |
   |-------|-------|
   | Project name | `dominion` |
   | Build command | `npm run build:site` |
   | Deploy command | `npx wrangler deploy` (default) |
   | Preview command | `npx wrangler preview` (default) |

3. Save and deploy. Pushes to `main` deploy to production; other branches
   create a Preview (branch-isolated URL).

`wrangler.toml` declares the assets directory (`[assets] directory = "public"`)
so `wrangler deploy` uploads the built site; there is no Worker script.

**Or deploy from the CLI** (no Git integration):

```bash
npm run deploy            # build:site + wrangler deploy  (production)
npm run deploy:preview    # build:site + wrangler versions upload (version URL)
npm run preview           # build:site + wrangler dev     (local)
```

**Caching & headers** are handled by `app/_headers`, which `build:site` copies
to `public/_headers`: content-hashed assets get
`Cache-Control: public, max-age=31536000, immutable`; the app shell, `sw.js`
and the unhashed `data/bundle.json` revalidate so updates land.

> **If the build can't find `tsc`** (some build images set `NODE_ENV=production`
> and skip devDependencies), use
> `npm ci --include=dev && npm run build:site` as the build command.

Custom domain + automatic HTTPS are available in the Worker's settings.

#### Classic Pages instead

If you pick a **Pages** project rather than a Worker, use *Build command*
`npm run build:site` and *Build output directory* `public`, and set
`pages_build_output_dir = "public"` in `wrangler.toml` instead of `[assets]`.

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
