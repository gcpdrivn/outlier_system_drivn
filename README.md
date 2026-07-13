# drivn-outlier

Outlier / distribution-analysis frontend for the Drivn platform — the "third
system". Per-**KM-band** statistical distributions of trip economics, for
analyst-driven outlier spotting.

Design spec: `drivn-server/docs/central-platform/06-outlier-analysis.md`.

## What it shows
For editable KM bands (default ≤250 · 250–500 · 500–750 · 750+), the distribution
of a chosen metric computed over **per-trip** values:

- Metrics: rev/km · rev/seat/km · ASP booked · ASP available · occupancy % · seats booked
- Per band: density histogram with **p25 / p50 / p75 / p90** markers, a
  mean⇄median (or off) centre line, plus **mean · std-dev** and the band summary
  (trips/day · avg occupancy · avg km)
- **Point checker** — type a value and see its percentile rank in each band
- Filters: route · bus class · fuel (EV/ICE) · window

> Per-trip distributions are **intentionally different** from the dashboard's
> *pooled* headline metrics — different question (spread of individual trips vs
> network aggregate), same canonical base quantities (doc 04). Not a data drift.

## Architecture
The browser never touches BigQuery. It calls the central **drivn-server**:
- `GET /api/outlier/distribution?metrics=…&bands=…&filter=…` (BQ `APPROX_QUANTILES` +
  `AVG` + `STDDEV` + `COUNT` over `fact_trips_captured`, grouped by KM band)
- Auth is enforced by the server (`/auth/*`); a login gate wraps the app.

## Develop
Requires `drivn-server` running on `:8080` (it holds BigQuery + auth).
```
npm install
npm run dev        # http://localhost:5182  (Vite proxies /api + /auth → :8080)
```
Sign in with a Drivn account (ask an admin to add you).

## Build / deploy
```
npm run build      # → dist/
```
Deployed as a Netlify static site; `netlify.toml` proxies `/api/*` + `/auth/*` to
the Cloud Run drivn-server. See `drivn-server/DEPLOYMENT.md`.