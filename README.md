# BriefBoard (Personal News Feed)

This repo is a Vite + React + TypeScript app for a personal daily brief.

## What MVP-1 adds

MVP-1 introduces **RSS ingestion and daily data generation**:

- A feed list in `config/rss-feeds.json`
- A source metadata file in `config/sources.json` (reliability, region, tags)
- A Node build script in `scripts/build-today-json.mjs`
- A generated output file at `public/data/today.json`
- A GitHub Actions workflow (`.github/workflows/deploy.yml`) that:
  - runs on a daily schedule,
  - rebuilds `today.json` from RSS,
  - builds the app,
  - deploys to GitHub Pages.

No extra npm libraries were added for RSS parsing. The script uses basic XML parsing logic with native Node APIs.

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
