# Cozy Digital — AI video

A studio product for [Cozy Digital](https://www.cozydigital.org). Clients sign in, leave a logo, product photos, and a brief, and the studio makes an AI video. **Cozy Agent** is the premium tier: a branded assistant that helps write the brief and pick shots, then queues the generation.

The landing page is a scroll-driven film in raw three.js (vendored, import map, no bundler). The desk, Cozy Agent, and admin panel are served by the same Node process.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

```bash
npm test
```

`npm run dev` restarts the server when files change.

## Sign in

The primary path matches the [client hub](https://hub.cozydigital.org): **Sign in with Google** goes to `GET /api/auth/google`. Email and password are the second path, as on the hub.

Google is off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. In development, the login page shows a labeled **preview sign-in** so the desk and admin can be tried without Google. That preview is not a real account. It is hidden in production unless `ALLOW_DEV_LOGIN=1`.

Accounts are keyed by email and, when Google is used, by Google’s subject id. This app does not read or write the hub’s database. The same Google client can be pointed at both later so a person is the same account in both products.

Admins are the addresses in `ADMIN_EMAILS`.

## Pricing

Prices are **not decided**. `config/pricing.js` holds the plan shape, empty prices, and empty allowances. The landing reads `GET /api/pricing` and shows an early-access treatment. A rough monthly figure that has been discussed internally is stored under `internalOnly` and is not rendered.

Final numbers for this product have to line up with the hub’s **Growth** and **Scale** plans so a client never gets two different quotes. This landing does not repeat the hub’s plan contents as its own offer.

Early-access accounts receive a small **preview allowance** (see `earlyAccessPreview` in the config). It is not a purchased balance. Stripe is a seam only: `POST /api/billing/checkout` returns 501 and does not charge a card.

## Higgsfield

All calls are server-side.

| Variable | Purpose |
| --- | --- |
| `HIGGSFIELD_API_KEY_ID` and `HIGGSFIELD_API_KEY_SECRET` | Documented key pair. Header is `Authorization: Key ID:SECRET`. |
| `HIGGSFIELD_API_KEY` | Same pair as `id:secret` in one variable. |

If neither is set, admin generation runs in **mock mode**. The admin banner says so, and every job is tagged `mock`. Nothing is sent to Higgsfield.

Live mode uses the current public API:

- `POST https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video`
- `POST https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video`
- `POST https://api.higgsfield.ai/files/generate-upload-url` for images that are not already public
- Status comes from the `status_url` in the submission response

Docs: https://docs.higgsfield.ai/docs

## Environment

Copy `.env.example` to `.env`. Never commit secrets.

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port. Defaults to 3000. |
| `APP_ORIGIN` | Public origin for the Google redirect. |
| `AUTH_SECRET` | Signs the session cookie. |
| `DATA_DIR` | Accounts, briefs, and uploads. |
| `ADMIN_EMAILS` | Comma-separated admin mailboxes. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. Redirect: `{APP_ORIGIN}/api/auth/google/callback`. |
| `ALLOW_DEV_LOGIN` | Set to `1` to keep preview sign-in on in production. |
| `BOOKING_URL` | “Book a call”. Defaults to the studio booking page. |
| `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` | Reserved. Checkout stays off. |

## Deploy

**Railway.** `npm start` listens on `PORT`. Mount a volume and set `DATA_DIR` to it so accounts and uploads survive deploys. Set `APP_ORIGIN` to the public URL and add that origin’s `/api/auth/google/callback` in Google Cloud.

**Vercel.** `vercel.json` routes traffic to `api/index.js` (Hono). The filesystem is ephemeral; if `DATA_DIR` is unset the app uses `/tmp/cozy-data`, which disappears. Use Railway, or another host with a disk, when the data has to last. Do not put the Higgsfield key in a client variable.

## Landing

`site/index.html` loads vendored three.js through an import map. Scroll targets come from native scroll; a damped value drives the DOM and the WebGL chapters. Chapter lengths live in `site/js/timeline.js`, in viewport heights. Pins ease in and out over 0.12 viewport heights. Each chapter renders into its own half-float target. A composite pass mixes them with a brush wipe, a small bloom pyramid, a filmic shoulder, and dither.

`window.__app` exposes `ready`, `layout`, `states`, `goto(name)`, `scroll`, `fps`, `quality`, and `renderer`. `?debug=1` shows the counter. `?bench=1` scrolls the film and records frame time. `?motion=reduce` forces the static page. `?motion=full` forces the film. `prefers-reduced-motion: reduce` uses the static page.

On a hardware GPU the composite stays in half-float targets with bloom, a filmic shoulder, and dither, capped at 960×600, and the canvas asks for antialiasing. This environment’s Chrome only exposes SwiftShader. There the page drops bloom and half-float, simplifies the background shader, and caps the buffer at 720×450. Every chapter is drawn twice during startup, before `window.__app.ready`. On that software driver the warm-up took about 100 ms. A 9 second scroll then measured about 23 fps as the average of per-frame rates, a minimum of about 12 fps, and about 22 frames delivered per second (186 frames in the measured window). The compile stall near 1 fps did not recur. Lit materials and antialiasing cost frame rate against the earlier unlit pass. That is not a laptop measurement. `window.__app.renderer`, `window.__app.quality`, and `window.__app.warmMs` say which path ran.

The film is procedural. It does not use portraits. Facts and sources are in the footer. If a date was in conflict across sources, it was left out.

## What is still open

- Prices and video allowances, to be aligned with hub Growth and Scale.
- Shared Google subject with the hub’s user table. The sign-in path matches; the databases do not.
- Live Higgsfield output needs a key and a public or uploaded image. Mock mode is the default.
- Stripe Checkout is intentionally not implemented.
