# Engram — marketing/install site

The "link to show" for Engram: hero, real screenshot of the actual running web UI, and a 6-step
installation guide, sharing the Engram web UI's cream-and-orange palette. Plain Next.js App
Router, no CMS, no API routes — just a static page.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. (If FalkorDB's Browser UI is already running on :3000 from the main
project's `docker compose up -d`, use `npm run dev -- -p 3001` instead.)

## Deploy to Vercel

This lives inside the `engram` monorepo, not as its own repo, so when you import the project on
Vercel:

1. Push this repo to GitHub (already done — `github.com/ivedmohan/engram`).
2. On [vercel.com/new](https://vercel.com/new), import the `engram` repo.
3. Set **Root Directory** to `site` (Vercel's project settings — this is the one setting that
   matters for a monorepo subdirectory; everything else auto-detects as Next.js).
4. Deploy. No environment variables needed — this page doesn't talk to the daemon or FalkorDB at
   all, it's a static page about the project.

Every push to `main` that touches `site/` will redeploy automatically once connected.

## Updating the screenshot

The hero screenshot is `public/web-ui.jpg`, copied from `../docs/web-ui.jpg` (the same one used in
the main project's `README.md`). Re-copy it here after recapturing:

```bash
cp ../docs/web-ui.jpg public/web-ui.jpg
```
