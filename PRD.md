## Guardrails

- Make one PR per milestone (MVP-0, MVP-1, etc.), not one monster PR.
- Start with mock JSON + UI before touching RSS.
- Require no extra libraries unless there is a clear explanation of why.

---

Below is the updated PRD. It keeps every feature you listed, but makes the **personal news feed** the main product, with coverage/bias/accuracy tooling as supporting layers (not the headline).

---

## Product Requirements Document (PRD)

### Product name

Working title: **BriefBoard** (previous placeholder: BiasBoard).
Core product: **personal news feed**.

---

### 1) Summary

You will build a daily-refreshing **personal news feed** that pulls top stories, clusters them by event, ranks them into a “read this first” order, and shows one recommended “Best Source” per story. Users (you, MVP) can open a story to audit coverage, compare headlines, view a rule-trace for why the best link was picked, tune source preferences, and optionally read a structured Assessment.

---

### 2) Problem

News consumption is:

* fragmented across sources
* time-wasting (too many tabs, low signal)
* hard to trust (coverage gaps, framing differences, mixed outlet quality)

You want:

* a single daily reading list you can finish
* one recommended link per story, chosen using your preferences
* audit tools that improve accuracy: coverage evidence, source controls, and transparent selection rules

---

### 3) Goals

**Product goals**

* Give you a daily brief you complete.
* Rank stories into a sensible “read first” order.
* Pick one “Best Source” per story, based on your settings.
* Make accuracy checks fast: coverage breadth, headline comparison, and blind spots.
* Let you tune the feed with source weights and thresholds.

**Success metrics (MVP)**

* You open the personal news feed daily.
* You finish the Daily Brief at least 4 days/week.
* You open “Coverage” on at least 2 stories/day.
* You adjust Sources/Settings at least once/week (signals the controls matter).

---

### 4) Target users

* Primary user (MVP): you (Politics/American Studies student; wants fast overview + accuracy checks)
* Secondary (later): other students, journalists, policy people

---

### 5) Assumptions and constraints

* Browser-first dev (StackBlitz/Codespaces).
* Deploy to static hosting (GitHub Pages / Vercel / Netlify).
* MVP avoids a live always-on backend.
* Daily refresh comes from a build script scheduled via CI.
* Bias/reliability data starts as a manual curated `sources.json` (licensed datasets later if needed).
* No scraping full article text for MVP (headlines + snippets only).

---

### 6) Scope

**In scope (MVP)**

* Daily brief with ranked story clusters
* Story clustering + deduplication
* Best Source pick per cluster using your settings
* Story detail view:

  * Coverage (who covered it, compare headlines, blind spots)
  * Why this link (rule trace)
  * Assessment (structured context)
* Sources tab (labels + controls that shape your feed)
* App Settings (thresholds, ranking preferences, UI)
* Archive by day
* Bookmarks + read state

**Out of scope (MVP)**

* User accounts + sync across devices
* Full-text parsing/scraping
* Push notifications
* Payments
* “Bias detection” per article as a truth meter (use evidence + source labels + transparency)

---

### 7) User experience (UX)

**Main navigation**

* Daily Brief
* Sources
* Archive
* Settings

#### Daily Brief (main feed)

For each story cluster (one card):

* Cluster headline (neutral best title)
* Best Source link (your feed picks one)
* Labels:

  * Reliability (High/Med/Low)
  * Source label (bias label optional, but visible)
  * Coverage breadth (Narrow/Medium/Broad)
  * Updated time
* Actions:

  * Coverage (opens story detail)
  * Why this link (rule trace)
  * Assessment
  * Mark read / bookmark

Feed sections:

* Top priority
* Worth scanning
* Low priority

Daily brief mode:

* progress indicator (read count)
* “Done for today” state

#### Story details

Sub-tabs:

1. Coverage
2. Why this link
3. Assessment

Coverage shows:

* all articles in the cluster
* counts by region and by your bias buckets (if you use them)
* headline compare list grouped by source labels
* blind spots: tracked outlets not present

Why this link shows:

* rule trace: “picked because X, Y, Z”
* “if settings changed, best pick would be …” (optional)

Assessment shows structured bullets:

* What happened (2–3 bullets)
* Why it matters (2–4 bullets)
* What to watch next (decision point, deadline)
* Stakeholders
* Open questions
* Optional short timeline

---

### 8) Functional requirements

#### A) Data ingestion

* Fetch headlines from:

  * RSS feeds (curated list)
  * Optional global aggregator feed (phase 2: GDELT)
* Normalise items:

  * canonical URL
  * cleaned title
  * source domain
  * timestamp
  * snippet when available

#### B) Deduplication

* Remove identical URLs
* Merge near-duplicates (syndication title reuse)

#### C) Story clustering

Group items into clusters using:

* title similarity
* shared key terms/entities (basic extraction)
* time window

Output per cluster:

* cluster id
* cluster headline (neutral “best title”)
* articles list

#### D) Story ranking (cluster ranking)

Rank clusters into reading order using:

* recency
* volume (# unique outlets)
* optional geography spread
* user topic boosts
* user region weighting
* optional keyword mutes (downrank/hide)

#### E) Best Source Pick (main feed)

Select one recommended article per cluster using:

* reliability threshold (must pass)
* user source weight (hide/normal/boost)
* bias distance (only if you enable bias buckets)
* sensationalism penalty (headline heuristic)
* freshness
* paywall handling (allow/downrank/hide)

Fallback:

* if nothing passes threshold, pick highest reliability available and label it “fallback”.

#### F) Coverage view (story-level)

Display:

* all articles in cluster
* coverage matrix:

  * bias bucket counts (if enabled)
  * region counts
  * headline compare list
  * blind spots vs your tracked outlets

#### G) Why this link (transparent selection)

Show:

* rule trace for Best Source pick
* optional: “next best alternatives” and what setting change would promote them

#### H) Assessment view (structured context)

Generate:

* What happened
* Why it matters
* What to watch next
* Stakeholders
* Open questions
* Optional short timeline

Include:

* links to sources used (from the cluster)

MVP note:

* Assessment can start as template-driven (no AI calls). Add AI later if wanted.

#### I) Sources (global source controls)

* `sources.json` holds:

  * domain
  * reliability score
  * region
  * tags (wire/original, paywall)
  * optional bias label
* Controls per outlet:

  * hide / normal / boost
  * max links per day cap
* Presets:

  * Neutral-first
  * Best reporting
  * International-first
  * Challenge me
* Global thresholds:

  * min reliability
  * max bias distance (if enabled)
  * sensationalism penalty strength
  * paywall handling

#### J) Settings (app-level)

* Stories per day (20/50/100)
* Priority split counts (top/scan/low)
* Region weighting sliders
* Topic boosts
* Keyword mute list
* UI: dark/light, compact, font size, default tab
* Storage: local-only mode, export data, clear history
* Archive retention window (e.g., last 30–90 days)

#### K) Archive

* Daily archive pages by date
* Open past days’ briefs
* Bookmarks persist across days
* Read-state persists (localStorage for MVP)

---

### 9) Non-functional requirements

* Fast load (static site reading prebuilt JSON)
* Works on mobile + desktop
* No secrets exposed in browser (keys only used in CI step if added later)
* Keyboard navigation
* Data integrity: schema validation for `today.json`
* Error handling: “data build failed” state with last successful date

---

### 10) Tech stack (MVP)

* Frontend: Vite + React + TypeScript
* State/storage: LocalStorage
* Build pipeline: Node script generates `public/data/today.json` + archives
* Scheduling: GitHub Actions cron
* Deploy: GitHub Pages (or Vercel/Netlify)

---

### 11) Data model (high-level)

**config/sources.json**

* domain
* reliability_score
* region
* tags[]
* bias_label (optional)
* user_weight (hide/normal/boost)
* max_links_per_day

**public/data/today.json**

* date
* generated_at
* clusters[]

  * cluster_id
  * rank_score
  * title
  * topic_tags[]
  * best_article

    * url
    * source_domain
    * labels (reliability, paywall, bias_label if enabled)
    * trace_summary
  * articles[]

    * url
    * title
    * source_domain
    * timestamp
    * snippet
    * labels (reliability, region, paywall, bias_label optional)

---

### 12) Risks and mitigations

* Clustering errors → add split/merge tools later; MVP shows cluster contents clearly
* Licensing issues for bias datasets → manual `sources.json` for MVP
* Low-quality outlets gaming attention → reliability thresholds + allowlist/denylist
* Overconfident “analysis” → keep Assessment structured, cite links used, allow “unknown”
* CI build failures → keep last successful `today.json` live and show build status

---

### 13) Milestones

1. **MVP-0:** UI skeleton (tabs + cards) + local mock JSON
2. **MVP-1:** RSS ingestion + today.json build + deploy
3. **MVP-2:** Clustering + ranking + Best Source pick driven by settings
4. **MVP-3:** Story details: Coverage + Why this link + Sources controls
5. **MVP-4:** Assessment view + Archive + polish

---

---

Below is the updated PRD. It keeps every feature you listed, but makes the **personal news feed** the main product, with coverage/bias/accuracy tooling as supporting layers (not the headline).

---

## Product Requirements Document (PRD)

### Product name

Working title: **BriefBoard** (previous placeholder: BiasBoard).
Core product: **personal news feed**.

---

### 1) Summary

You will build a daily-refreshing **personal news feed** that pulls top stories, clusters them by event, ranks them into a “read this first” order, and shows one recommended “Best Source” per story. Users (you, MVP) can open a story to audit coverage, compare headlines, view a rule-trace for why the best link was picked, tune source preferences, and optionally read a structured Assessment.

---

### 2) Problem

News consumption is:

* fragmented across sources
* time-wasting (too many tabs, low signal)
* hard to trust (coverage gaps, framing differences, mixed outlet quality)

You want:

* a single daily reading list you can finish
* one recommended link per story, chosen using your preferences
* audit tools that improve accuracy: coverage evidence, source controls, and transparent selection rules

---

### 3) Goals

**Product goals**

* Give you a daily brief you complete.
* Rank stories into a sensible “read first” order.
* Pick one “Best Source” per story, based on your settings.
* Make accuracy checks fast: coverage breadth, headline comparison, and blind spots.
* Let you tune the feed with source weights and thresholds.

**Success metrics (MVP)**

* You open the personal news feed daily.
* You finish the Daily Brief at least 4 days/week.
* You open “Coverage” on at least 2 stories/day.
* You adjust Sources/Settings at least once/week (signals the controls matter).

---

### 4) Target users

* Primary user (MVP): you (Politics/American Studies student; wants fast overview + accuracy checks)
* Secondary (later): other students, journalists, policy people

---

### 5) Assumptions and constraints

* Browser-first dev (StackBlitz/Codespaces).
* Deploy to static hosting (GitHub Pages / Vercel / Netlify).
* MVP avoids a live always-on backend.
* Daily refresh comes from a build script scheduled via CI.
* Bias/reliability data starts as a manual curated `sources.json` (licensed datasets later if needed).
* No scraping full article text for MVP (headlines + snippets only).

---

### 6) Scope

**In scope (MVP)**

* Daily brief with ranked story clusters
* Story clustering + deduplication
* Best Source pick per cluster using your settings
* Story detail view:

  * Coverage (who covered it, compare headlines, blind spots)
  * Why this link (rule trace)
  * Assessment (structured context)
* Sources tab (labels + controls that shape your feed)
* App Settings (thresholds, ranking preferences, UI)
* Archive by day
* Bookmarks + read state

**Out of scope (MVP)**

* User accounts + sync across devices
* Full-text parsing/scraping
* Push notifications
* Payments
* “Bias detection” per article as a truth meter (use evidence + source labels + transparency)

---

### 7) User experience (UX)

**Main navigation**

* Daily Brief
* Sources
* Archive
* Settings

#### Daily Brief (main feed)

For each story cluster (one card):

* Cluster headline (neutral best title)
* Best Source link (your feed picks one)
* Labels:

  * Reliability (High/Med/Low)
  * Source label (bias label optional, but visible)
  * Coverage breadth (Narrow/Medium/Broad)
  * Updated time
* Actions:

  * Coverage (opens story detail)
  * Why this link (rule trace)
  * Assessment
  * Mark read / bookmark

Feed sections:

* Top priority
* Worth scanning
* Low priority

Daily brief mode:

* progress indicator (read count)
* “Done for today” state

#### Story details

Sub-tabs:

1. Coverage
2. Why this link
3. Assessment

Coverage shows:

* all articles in the cluster
* counts by region and by your bias buckets (if you use them)
* headline compare list grouped by source labels
* blind spots: tracked outlets not present

Why this link shows:

* rule trace: “picked because X, Y, Z”
* “if settings changed, best pick would be …” (optional)

Assessment shows structured bullets:

* What happened (2–3 bullets)
* Why it matters (2–4 bullets)
* What to watch next (decision point, deadline)
* Stakeholders
* Open questions
* Optional short timeline

---

### 8) Functional requirements

#### A) Data ingestion

* Fetch headlines from:

  * RSS feeds (curated list)
  * Optional global aggregator feed (phase 2: GDELT)
* Normalise items:

  * canonical URL
  * cleaned title
  * source domain
  * timestamp
  * snippet when available

#### B) Deduplication

* Remove identical URLs
* Merge near-duplicates (syndication title reuse)

#### C) Story clustering

Group items into clusters using:

* title similarity
* shared key terms/entities (basic extraction)
* time window

Output per cluster:

* cluster id
* cluster headline (neutral “best title”)
* articles list

#### D) Story ranking (cluster ranking)

Rank clusters into reading order using:

* recency
* volume (# unique outlets)
* optional geography spread
* user topic boosts
* user region weighting
* optional keyword mutes (downrank/hide)

#### E) Best Source Pick (main feed)

Select one recommended article per cluster using:

* reliability threshold (must pass)
* user source weight (hide/normal/boost)
* bias distance (only if you enable bias buckets)
* sensationalism penalty (headline heuristic)
* freshness
* paywall handling (allow/downrank/hide)

Fallback:

* if nothing passes threshold, pick highest reliability available and label it “fallback”.

#### F) Coverage view (story-level)

Display:

* all articles in cluster
* coverage matrix:

  * bias bucket counts (if enabled)
  * region counts
  * headline compare list
  * blind spots vs your tracked outlets

#### G) Why this link (transparent selection)

Show:

* rule trace for Best Source pick
* optional: “next best alternatives” and what setting change would promote them

#### H) Assessment view (structured context)

Generate:

* What happened
* Why it matters
* What to watch next
* Stakeholders
* Open questions
* Optional short timeline

Include:

* links to sources used (from the cluster)

MVP note:

* Assessment can start as template-driven (no AI calls). Add AI later if wanted.

#### I) Sources (global source controls)

* `sources.json` holds:

  * domain
  * reliability score
  * region
  * tags (wire/original, paywall)
  * optional bias label
* Controls per outlet:

  * hide / normal / boost
  * max links per day cap
* Presets:

  * Neutral-first
  * Best reporting
  * International-first
  * Challenge me
* Global thresholds:

  * min reliability
  * max bias distance (if enabled)
  * sensationalism penalty strength
  * paywall handling

#### J) Settings (app-level)

* Stories per day (20/50/100)
* Priority split counts (top/scan/low)
* Region weighting sliders
* Topic boosts
* Keyword mute list
* UI: dark/light, compact, font size, default tab
* Storage: local-only mode, export data, clear history
* Archive retention window (e.g., last 30–90 days)

#### K) Archive

* Daily archive pages by date
* Open past days’ briefs
* Bookmarks persist across days
* Read-state persists (localStorage for MVP)

---

### 9) Non-functional requirements

* Fast load (static site reading prebuilt JSON)
* Works on mobile + desktop
* No secrets exposed in browser (keys only used in CI step if added later)
* Keyboard navigation
* Data integrity: schema validation for `today.json`
* Error handling: “data build failed” state with last successful date

---

### 10) Tech stack (MVP)

* Frontend: Vite + React + TypeScript
* State/storage: LocalStorage
* Build pipeline: Node script generates `public/data/today.json` + archives
* Scheduling: GitHub Actions cron
* Deploy: GitHub Pages (or Vercel/Netlify)

---

### 11) Data model (high-level)

**config/sources.json**

* domain
* reliability_score
* region
* tags[]
* bias_label (optional)
* user_weight (hide/normal/boost)
* max_links_per_day

**public/data/today.json**

* date
* generated_at
* clusters[]

  * cluster_id
  * rank_score
  * title
  * topic_tags[]
  * best_article

    * url
    * source_domain
    * labels (reliability, paywall, bias_label if enabled)
    * trace_summary
  * articles[]

    * url
    * title
    * source_domain
    * timestamp
    * snippet
    * labels (reliability, region, paywall, bias_label optional)

---

### 12) Risks and mitigations

* Clustering errors → add split/merge tools later; MVP shows cluster contents clearly
* Licensing issues for bias datasets → manual `sources.json` for MVP
* Low-quality outlets gaming attention → reliability thresholds + allowlist/denylist
* Overconfident “analysis” → keep Assessment structured, cite links used, allow “unknown”
* CI build failures → keep last successful `today.json` live and show build status

---

### 13) Milestones

1. **MVP-0:** UI skeleton (tabs + cards) + local mock JSON
2. **MVP-1:** RSS ingestion + today.json build + deploy
3. **MVP-2:** Clustering + ranking + Best Source pick driven by settings
4. **MVP-3:** Story details: Coverage + Why this link + Sources controls
5. **MVP-4:** Assessment view + Archive + polish
