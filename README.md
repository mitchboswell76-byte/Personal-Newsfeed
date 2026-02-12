# BriefBoard (Personal News Feed)

## Version
- Current version: **MVP-2**
- Last update: **Added settings-driven ranking and best-source selection, plus stronger MVP-1 data pipeline metadata/deduplication hardening.**

This repo is a Vite + React + TypeScript app for a personal daily brief.

## What MVP-2 adds

MVP-2 introduces settings-driven ranking and source selection on top of MVP-1 data generation:

- Feed ranking now reacts to settings like stories/day, top/scan split, keyword mutes, and topic boosts.
- Best Source selection now reacts to settings like minimum reliability, paywall handling, and per-source hide/normal/boost.
- Settings persist in localStorage so the feed stays personalized after refresh.

## MVP-1 data pipeline (still in place)

- Feed list: `config/rss-feeds.json`
- Source metadata: `config/sources.json` (reliability, region, tags)
- Build script: `scripts/build-today-json.mjs`
- Output: `public/data/today.json`
- Daily CI deploy workflow: `.github/workflows/deploy.yml`

## Local development

```bash
npm install
npm run dev
```

## Build commands

```bash
# Build data file from RSS feeds only
npm run build:data

# Build frontend app only
npm run build

# MVP-1 full build: data + app
npm run build:mvp1
```

## Notes

- `public/data/today.json` is what the UI reads.
- If one feed fails, the script logs the feed and continues with the others.
- If all feeds fail, the build script exits with an error.
- Output is validated before write and fails fast with readable messages if required fields are missing.
