# BriefBoard (Personal News Feed)

## Version
- Current version: **MVP-4**
- Last update: **Completed MVP-4 polish: improved Assessment with timeline/source links support, added archive previous/next day navigation, and improved practical testing guidance.**

## What the app does now (plain English)
BriefBoard gives you one daily reading list of clustered stories, picks one recommended source per story based on your settings, and lets you audit coverage/headlines/selection logic.

## What is completed up to MVP-3
- Daily Brief with top/scan/low sections
- Read + bookmark persistence
- Story details tabs (Coverage, Why this link, Assessment placeholder)
- Source controls (hide/normal/boost)
- Ranking controls (stories/day, split counts, reliability, paywall, keyword mutes, topic boosts, region weights)
- Archive date browsing using generated `public/data/index.json`
- Keyboard shortcuts: `B` Brief, `S` Sources, `A` Archive, `T` Settings, `Esc` closes story detail
- Accessibility additions: skip link, clearer section indicator, improved responsive layout


## Simple MVP-4 check list (what to check it for)
1. Run:
   ```bash
   npm install
   USE_MOCK_RSS=1 npm run build:data
   npm run dev
   ```
2. Open the app in Codespaces Ports (port 5173).
3. Check Daily Brief: mark stories read/bookmarked and open Coverage/Why/Assessment.
4. Check Assessment tab: confirms What happened/Why it matters/Watch next plus timeline/source links when available.
5. Check Archive tab: try Previous day, Next day, Jump to today, and date picker.
6. Check Settings + Sources: adjust values and verify story ranking/picks change.

## Data pipeline (MVP-1 + MVP-2 hardening)
- RSS feed list: `config/rss-feeds.json`
- Source metadata: `config/sources.json`
- Build script: `scripts/build-today-json.mjs`
- Output files:
  - `public/data/today.json`
  - `public/data/<YYYY-MM-DD>/today.json` (archive)
  - `public/data/index.json` (archive dates)
  - `public/data/sources.json` (for Sources tab metadata)

## Environment variables
Create `.env` from `.env.example` if you want to override defaults.

- `RSS_FEEDS_PATH` (default `../config/rss-feeds.json`)
- `SOURCES_PATH` (default `../config/sources.json`)
- `RSS_TIMEOUT_MS` (default `12000`)
- `MAX_STORIES` (default `40`)
- `USE_MOCK_RSS` (`1` for mock XML mode, `0` for live RSS)
- `MOCK_FEEDS_DIR` (default `../scripts/mock-feeds`)

## Commands
```bash
npm install
npm run dev
npm run build:data
npm run build
npm run serve
npm run lint
npm run docs
npm run test
```

## CI/Deploy
- Daily workflow: `.github/workflows/build-daily.yml` (8:00 UTC)
- Existing deploy workflow: `.github/workflows/deploy.yml`
- Both run the data build before front-end deploy.
