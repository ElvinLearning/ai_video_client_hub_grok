# Cozy Digital — AI video

A studio product for [Cozy Digital](https://www.cozydigital.org). Clients sign in, leave a logo, product photos, and a brief, and the studio makes an AI video. **Cozy Agent** is the premium tier: a branded assistant that helps write the brief and pick shots, then queues the generation.

The landing page is **The Atelier Edition**: an editorial, scroll-driven page in the style of a product “edition”, built from painted still lifes. The desk, Cozy Agent, and admin panel are served by the same Node process.

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

`site/index.html`, `site/css/landing.css`, and `site/js/main.js`. No framework and no bundler; the page is plain HTML, CSS, and one module.

The page runs in this order: a hero painting in three depths, a statement that lights up word by word, a pinned **How it works** gallery where each painting is brushed over the last, a parchment **studio** grid of feature cards, the **Cozy Agent** spotlight, a horizontal **lineage** hanging, pricing from `GET /api/pricing`, and a layered closing plate. Sections meet with a dry-brush edge. A sticky chapter bar tracks where you are.

`window.__app` exposes `ready`, `goto(name)`, `active`, `chapters`, and `fps`. `?debug=1` shows the counter. `?motion=reduce` forces the static page, and `?motion=full` forces motion. `prefers-reduced-motion: reduce` gets the static page: no pinning, no parallax, flat paintings.

### The paintings

Every picture is in `site/media` and is made by `tools/paint`, not drawn by hand, generated by an image model, or taken from stock. Each scene is a three.js still life (cloth, glass, fruit, candles, phones, books, an armillary sphere) lit like a chiaroscuro painting. The render is tone-mapped, then turned into paint: an anisotropic Kuwahara filter flattens areas into strokes that follow the forms, line integral convolution adds bristle texture along the same field, and a last pass adds impasto relief, canvas weave, and a varnish grade.

The hero and closing plates are painted in layers (`-back`, `-mid`, `-front`). Each layer is painted with everything nearer removed, so parallax never opens a hole. Nearer layers are cut out of the full painting with a coverage mask, so glass keeps whatever stands behind it.

```bash
npm run paint                       # every scene into site/media (about 15 minutes in software GL)
npm run paint -- hero cta           # only these
npm run paint -- --preview --flat --scale=0.5 hero   # quick PNG in workbench/out/paint
```

The runner prints where the candle flame and phone screen fall in the hero, which is where the CSS places the live glows. Scenes that crop from other paintings (`brand`, `deliver`, `f-motion`, `f-social`, `f-review`) read them from `site/media`, so paint `hero`, `f-product`, and `f-season` first after changing them. The lineage paintings are still lifes of the work. They are not portraits.

`npm run critic` takes desktop, phone, and reduced-motion screenshots into `workbench/out` and scrolls the page once to record frame rate.

## What is still open

- Prices and video allowances, to be aligned with hub Growth and Scale.
- Shared Google subject with the hub’s user table. The sign-in path matches; the databases do not.
- Live Higgsfield output needs a key and a public or uploaded image. Mock mode is the default.
- Stripe Checkout is intentionally not implemented.
