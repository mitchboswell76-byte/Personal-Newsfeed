import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Priority = "top" | "scan" | "low";
type TabKey = "brief" | "sources" | "archive" | "settings";
type StoryDetailTab = "coverage" | "why" | "assessment";
type PaywallMode = "allow" | "downrank" | "hide";
type SourceWeight = "hide" | "normal" | "boost";
type ThemeMode = "light" | "dark" | "system";

type Labels = {
  reliability: "High" | "Med" | "Low";
  paywall: "Yes" | "No";
  bias_label?: string;
  region?: string;
};

type Article = {
  url: string;
  title: string;
  source_domain: string;
  timestamp: string;
  snippet: string;
  labels: Labels;
};

type BestArticle = {
  url: string;
  source_domain: string;
  image_url?: string;
  labels: Labels;
  trace_summary: string;
};

type Cluster = {
  cluster_id: string;
  rank_score: number;
  priority: Priority;
  title: string;
  topic_tags: string[];
  updated_at: string;
  coverage_breadth: "Narrow" | "Medium" | "Broad";
  best_article: BestArticle;
  articles: Article[];
};

type Today = {
  date: string;
  generated_at: string;
  clusters: Cluster[];
};

type SourceMeta = {
  domain: string;
  reliability_score: number;
  region: string;
  tags: string[];
  bias_label?: string;
  user_weight?: SourceWeight;
  max_links_per_day?: number;
};

type ArchiveIndex = { dates: string[] };

type Assessment = {
  what_happened: string[];
  why_it_matters: string[];
  what_to_watch: { decision_point: string; deadline: string };
  stakeholders: string[];
  open_questions: string[];
};

type Alternative = {
  article: Article;
  reason: string;
};

type FeedSettings = {
  storiesPerDay: number;
  topCount: number;
  scanCount: number;
  minReliability: Labels["reliability"];
  paywallMode: PaywallMode;
  keywordMutes: string[];
  topicBoosts: string[];
  sourceWeights: Record<string, SourceWeight>;
  regionWeights: Record<string, number>;
  theme: ThemeMode;
  fontSize: number;
  compactMode: boolean;
  defaultTab: TabKey;
  archiveRetentionDays: 30 | 60 | 90 | 180;
};

const TAB_LABELS: Record<TabKey, string> = {
  brief: "Daily Brief",
  sources: "Sources",
  archive: "Archive",
  settings: "Settings",
};

const DETAIL_TAB_LABELS: Record<StoryDetailTab, string> = {
  coverage: "Coverage",
  why: "Why this link",
  assessment: "Assessment",
};

const DEFAULT_SETTINGS: FeedSettings = {
  storiesPerDay: 20,
  topCount: 5,
  scanCount: 10,
  minReliability: "Med",
  paywallMode: "downrank",
  keywordMutes: [],
  topicBoosts: [],
  sourceWeights: {},
  regionWeights: { US: 1, Europe: 1, Asia: 1, Global: 1 },
  theme: "system",
  fontSize: 16,
  compactMode: false,
  defaultTab: "brief",
  archiveRetentionDays: 90,
};

const STORAGE_KEYS = {
  read: "pnf.readIds",
  bookmarks: "pnf.bookmarkedIds",
  activeTab: "pnf.activeTab",
  detailTab: "pnf.detailTab",
  detailStory: "pnf.detailStoryId",
  settings: "pnf.settings.v2",
  archiveDate: "pnf.archiveDate",
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function reliabilityValue(value: Labels["reliability"]) {
  if (value === "High") return 3;
  if (value === "Med") return 2;
  return 1;
}

function sourceWeightValue(weight: SourceWeight) {
  if (weight === "boost") return 1;
  if (weight === "hide") return -3;
  return 0;
}

function relativeTime(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
}

function sensationalismPenalty(title: string) {
  let penalty = 0;
  if (/\b(SHOCKING|EXPLOSIVE|STUNNING|BOMBSHELL|EXCLUSIVE)\b/i.test(title)) penalty += 0.3;
  if ((title.match(/!/g) || []).length > 1) penalty += 0.2;
  if (/^[A-Z\s]{18,}$/.test(title)) penalty += 0.3;
  return penalty;
}

function chooseBestArticle(cluster: Cluster, settings: FeedSettings): { best: Article; trace: string; alternatives: Alternative[] } {
  const scored = cluster.articles.map((article) => {
    const sourceWeight = settings.sourceWeights[article.source_domain] ?? "normal";
    const reliability = reliabilityValue(article.labels.reliability);
    const freshness = Math.max(0, 48 - (Date.now() - new Date(article.timestamp).getTime()) / 3_600_000) / 24;
    const sensational = sensationalismPenalty(article.title);
    const paywallPenalty = settings.paywallMode === "hide" && article.labels.paywall === "Yes"
      ? -100
      : settings.paywallMode === "downrank" && article.labels.paywall === "Yes"
        ? -1
        : 0;

    const blocked =
      reliability < reliabilityValue(settings.minReliability) ||
      sourceWeight === "hide" ||
      (settings.paywallMode === "hide" && article.labels.paywall === "Yes");

    const regionBoost = settings.regionWeights[article.labels.region ?? "Global"] ?? 1;

    return {
      article,
      blocked,
      score: reliability * 3 + sourceWeightValue(sourceWeight) + freshness + regionBoost - sensational + paywallPenalty,
    };
  }).sort((a, b) => b.score - a.score);

  const bestEntry = scored.find((entry) => !entry.blocked) ?? scored[0];
  const alternatives = scored
    .filter((entry) => entry.article.url !== bestEntry.article.url)
    .slice(0, 3)
    .map((entry) => ({
      article: entry.article,
      reason: entry.blocked
        ? "Blocked by current settings (reliability/paywall/source weight)."
        : "Scored lower due to freshness, source preference, or headline quality.",
    }));

  const trace = bestEntry.blocked
    ? "Fallback pick: nothing passed your settings, so highest available reliability was selected."
    : `Best Source: ${bestEntry.article.source_domain} (reliability ${bestEntry.article.labels.reliability}, paywall ${bestEntry.article.labels.paywall}, paywall mode ${settings.paywallMode}).`;

  return { best: bestEntry.article, trace, alternatives };
}

function deriveClusters(data: Today, settings: FeedSettings) {
  const mutes = settings.keywordMutes.map((k) => k.toLowerCase());
  const boosts = settings.topicBoosts.map((k) => k.toLowerCase());

  return data.clusters
    .map((cluster) => {
      const { best, trace, alternatives } = chooseBestArticle(cluster, settings);
      const recencyScore = Math.max(0, 72 - (Date.now() - new Date(cluster.updated_at).getTime()) / 3_600_000);
      const outletCount = new Set(cluster.articles.map((a) => a.source_domain)).size;
      const regionSet = new Set(cluster.articles.map((a) => a.labels.region ?? "Global"));
      const regionBoost = Array.from(regionSet).reduce((sum, region) => sum + (settings.regionWeights[region] ?? 0.7), 0) / regionSet.size;
      const topicBoost = cluster.topic_tags.some((tag) => boosts.includes(tag.toLowerCase())) ? 0.4 : 0;
      const muted = mutes.some((word) => cluster.title.toLowerCase().includes(word));
      const rank =
        (recencyScore / 72) * 0.3 +
        (outletCount * 0.2) * 0.25 +
        regionBoost * 0.2 +
        topicBoost * 0.15 +
        (muted ? -0.8 : 0) * 0.1;

      return {
        ...cluster,
        rank_score: Number(rank.toFixed(3)),
        best_article: {
          ...cluster.best_article,
          url: best.url,
          source_domain: best.source_domain,
          labels: best.labels,
          trace_summary: trace,
        },
        _alternatives: alternatives,
      };
    })
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, settings.storiesPerDay)
    .map((cluster, index) => ({
      ...cluster,
      priority: index < settings.topCount ? "top" : index < settings.topCount + settings.scanCount ? "scan" : "low",
    }));
}

function applyTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
}

const PRESETS: Record<string, Partial<FeedSettings>> = {
  "neutral-first": { minReliability: "High", paywallMode: "downrank" },
  "best-reporting": { minReliability: "High", paywallMode: "hide" },
  "international-first": { regionWeights: { US: 0.8, Europe: 1.2, Asia: 1.2, Global: 1.3 } },
  "challenge-me": { minReliability: "Med", paywallMode: "allow" },
};

type FeedSettings = {
  storiesPerDay: number;
  topCount: number;
  scanCount: number;
  minReliability: Labels["reliability"];
  paywallMode: PaywallMode;
  keywordMutes: string[];
  topicBoosts: string[];
  sourceWeights: Record<string, SourceWeight>;
};

const TAB_LABELS: Record<TabKey, string> = {
  brief: "Daily Brief",
  sources: "Sources",
  archive: "Archive",
  settings: "Settings",
};

const DETAIL_TAB_LABELS: Record<StoryDetailTab, string> = {
  coverage: "Coverage",
  why: "Why this link",
  assessment: "Assessment",
};

const READ_IDS_KEY = "pnf.readIds";
const BOOKMARK_IDS_KEY = "pnf.bookmarkedIds";
const ACTIVE_TAB_KEY = "pnf.activeTab";
const DETAIL_TAB_KEY = "pnf.detailTab";
const DETAIL_STORY_KEY = "pnf.detailStoryId";
const SETTINGS_KEY = "pnf.settings.v2";

const DEFAULT_SETTINGS: FeedSettings = {
  storiesPerDay: 20,
  topCount: 5,
  scanCount: 10,
  minReliability: "Med",
  paywallMode: "downrank",
  keywordMutes: [],
  topicBoosts: [],
  sourceWeights: {},
};

function readFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    if (value === null) {
      return fallback;
    }

    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function reliabilityValue(reliability: Labels["reliability"]): number {
  if (reliability === "High") return 3;
  if (reliability === "Med") return 2;
  return 1;
}

function sourceWeightValue(weight: SourceWeight): number {
  if (weight === "boost") return 1;
  if (weight === "hide") return -3;
  return 0;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
}

function chooseBestArticle(cluster: Cluster, settings: FeedSettings) {
  const scored = cluster.articles
    .map((article) => {
      const sourceWeight = settings.sourceWeights[article.source_domain] ?? "normal";
      const reliability = reliabilityValue(article.labels.reliability);
      const freshness = Math.max(0, 48 - (Date.now() - new Date(article.timestamp).getTime()) / (1000 * 60 * 60));
      const paywallPenalty = settings.paywallMode === "hide" && article.labels.paywall === "Yes"
        ? -100
        : settings.paywallMode === "downrank" && article.labels.paywall === "Yes"
          ? -1
          : 0;

      const blockedByReliability = reliability < reliabilityValue(settings.minReliability);
      const hiddenBySource = sourceWeight === "hide";
      const hiddenByPaywall = settings.paywallMode === "hide" && article.labels.paywall === "Yes";

      return {
        article,
        score: reliability * 3 + sourceWeightValue(sourceWeight) + freshness / 24 + paywallPenalty,
        blocked: blockedByReliability || hiddenBySource || hiddenByPaywall,
      };
    })
    .sort((a, b) => b.score - a.score);

  const winner = scored.find((entry) => !entry.blocked);
  if (winner) {
    return {
      article: winner.article,
      trace: `Picked for reliability, source weight, freshness, and paywall rule (${settings.paywallMode}).`,
      fallback: false,
    };
  }

  const fallback = [...cluster.articles].sort(
    (a, b) => reliabilityValue(b.labels.reliability) - reliabilityValue(a.labels.reliability),
  )[0];

  return {
    article: fallback,
    trace: "Fallback pick: nothing matched current settings, so highest reliability source was used.",
    fallback: true,
  };
}

function deriveClusters(data: Today, settings: FeedSettings): Cluster[] {
  const keywordMutes = settings.keywordMutes.map((keyword) => keyword.toLowerCase());
  const topicBoosts = settings.topicBoosts.map((topic) => topic.toLowerCase());

  return data.clusters
    .map((cluster) => {
      const best = chooseBestArticle(cluster, settings);
      const muted = keywordMutes.some((word) => cluster.title.toLowerCase().includes(word));
      const boost = cluster.topic_tags.some((tag) => topicBoosts.includes(tag.toLowerCase())) ? 0.4 : 0;
      const recencyHours = Math.max(0, 72 - (Date.now() - new Date(cluster.updated_at).getTime()) / (1000 * 60 * 60));
      const outletCount = new Set(cluster.articles.map((article) => article.source_domain)).size;

      return {
        ...cluster,
        best_article: {
          ...cluster.best_article,
          url: best.article.url,
          source_domain: best.article.source_domain,
          labels: {
            reliability: best.article.labels.reliability,
            paywall: best.article.labels.paywall,
            bias_label: best.article.labels.bias_label,
            region: best.article.labels.region,
          },
          trace_summary: best.trace,
        },
        rank_score: Number((recencyHours / 72 + outletCount * 0.2 + boost - (muted ? 0.8 : 0)).toFixed(3)),
      };
    })
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) {
        return b.rank_score - a.rank_score;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, settings.storiesPerDay)
    .map((cluster, index) => ({
      ...cluster,
      priority: index < settings.topCount ? "top" : index < settings.topCount + settings.scanCount ? "scan" : "low",
    }));
}

export default function App() {
  const [settings, setSettings] = useState<FeedSettings>(() => ({ ...DEFAULT_SETTINGS, ...readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS) }));
  const [activeTab, setActiveTab] = useState<TabKey>(() => readStorage(STORAGE_KEYS.activeTab, settings.defaultTab));
  const [activeDetailTab, setActiveDetailTab] = useState<StoryDetailTab>(() => readStorage(STORAGE_KEYS.detailTab, "coverage"));
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(() => readStorage(STORAGE_KEYS.detailStory, null));
  const [readIds, setReadIds] = useState<string[]>(() => readStorage(STORAGE_KEYS.read, []));
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => readStorage(STORAGE_KEYS.bookmarks, []));

  const [todayData, setTodayData] = useState<Today | null>(null);
  const [sourcesMeta, setSourcesMeta] = useState<SourceMeta[]>([]);
  const [archiveIndex, setArchiveIndex] = useState<string[]>([]);
  const [archiveDate, setArchiveDate] = useState<string | null>(() => readStorage(STORAGE_KEYS.archiveDate, null));
  const [archiveData, setArchiveData] = useState<Today | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keywordInput, setKeywordInput] = useState("");
  const [topicInput, setTopicInput] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/data/today.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`today.json ${r.status}`)))),
      fetch("/data/sources.json").then((r) => (r.ok ? r.json() : [] as SourceMeta[])).catch(() => [] as SourceMeta[]),
      fetch("/data/index.json").then((r) => (r.ok ? r.json() : ({ dates: [] } as ArchiveIndex))).catch(() => ({ dates: [] } as ArchiveIndex)),
    ])
      .then(([today, sources, index]) => {
        setTodayData(today as Today);
        setSourcesMeta(sources as SourceMeta[]);
        setArchiveIndex((index as ArchiveIndex).dates ?? []);
      })
      .catch((err) => setError(`Could not load feed data: ${String(err?.message ?? err)}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.activeTab, JSON.stringify(activeTab)), [activeTab]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.detailTab, JSON.stringify(activeDetailTab)), [activeDetailTab]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.detailStory, JSON.stringify(selectedClusterId)), [selectedClusterId]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.read, JSON.stringify(readIds)), [readIds]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarkedIds)), [bookmarkedIds]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.archiveDate, JSON.stringify(archiveDate)), [archiveDate]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "b") setActiveTab("brief");
      if (event.key.toLowerCase() === "s") setActiveTab("sources");
      if (event.key.toLowerCase() === "a") setActiveTab("archive");
      if (event.key.toLowerCase() === "t") setActiveTab("settings");
      if (event.key === "Escape") setSelectedClusterId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const clusters = useMemo(() => (todayData ? deriveClusters(todayData, settings) : []), [todayData, settings]);

  const selectedCluster = useMemo(() => clusters.find((c) => c.cluster_id === selectedClusterId) ?? null, [clusters, selectedClusterId]);

  useEffect(() => {
    if (!selectedCluster || activeDetailTab !== "assessment") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    fetch(`/data/assessments/${selectedCluster.cluster_id}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setAssessment(payload))
      .catch(() => setAssessment(null));
  }, [selectedCluster, activeDetailTab]);

  useEffect(() => {
    if (!archiveDate) return;
    fetch(`/data/${archiveDate}/today.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Archive ${archiveDate} missing`))))
      .then((payload: Today) => setArchiveData(payload))
      .catch(() => setArchiveData(null));
  }, [archiveDate]);

  const progress = useMemo(() => {
    const total = clusters.length;
    const read = clusters.filter((c) => readIds.includes(c.cluster_id)).length;
    return { total, read, done: total > 0 && read === total };
  }, [clusters, readIds]);

  const trackedDomains = useMemo(() => sourcesMeta.map((source) => source.domain), [sourcesMeta]);
  const selectedAlternatives = (selectedCluster as (Cluster & { _alternatives?: Alternative[] }) | null)?._alternatives ?? [];

  const coverageSummary = useMemo(() => {
    if (!selectedCluster) return { byRegion: {} as Record<string, number>, byBias: {} as Record<string, number>, blindSpots: [] as string[] };
    const byRegion: Record<string, number> = {};
    const byBias: Record<string, number> = {};
    for (const article of selectedCluster.articles) {
      const region = article.labels.region ?? "Unknown";
      const bias = article.labels.bias_label ?? "Unknown";
      byRegion[region] = (byRegion[region] ?? 0) + 1;
      byBias[bias] = (byBias[bias] ?? 0) + 1;
    }
    const present = new Set(selectedCluster.articles.map((a) => a.source_domain));
    const blindSpots = trackedDomains.filter((domain) => !present.has(domain));
    return { byRegion, byBias, blindSpots };
  }, [selectedCluster, trackedDomains]);

  const sectionIndicator = TAB_LABELS[activeTab];

  const baseRenderData = activeTab === "archive" && archiveData ? deriveClusters(archiveData, settings) : clusters;

  return (
    <main className={`app-shell ${settings.compactMode ? "compact" : ""}`} style={{ fontSize: `${settings.fontSize}px` }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="app-header">
        <p className="eyebrow">BriefBoard · MVP-2</p>
        <h1>Personal News Feed</h1>
        <p className="subtitle">Now with clustering-aware ranking, source controls, archive browsing, and keyboard shortcuts.</p>
        <p className="breadcrumb">Current section: {sectionIndicator}</p>
      </header>

      <nav className="tab-nav" aria-label="Main sections">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <button key={tab} type="button" className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {error ? <p className="error">{error}</p> : null}

      <section id="main-content" className="panel">
        {loading ? (
          <div className="skeleton-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-card" />)}</div>
        ) : null}

        {!loading && (activeTab === "brief" || activeTab === "archive") ? (
          <>
            <div className="daily-meta">
              <p><strong>Date:</strong> {activeTab === "archive" && archiveDate ? archiveDate : todayData?.date}</p>
              <p><strong>Generated:</strong> {todayData ? new Date(todayData.generated_at).toLocaleString() : "-"}</p>
              <p><strong>Progress:</strong> {progress.read}/{progress.total} read</p>
            </div>
            {progress.done ? <p className="done-banner">Done for today ✅</p> : null}

            {(["top", "scan", "low"] as Priority[]).map((priority) => {
              const title = priority === "top" ? "Top priority" : priority === "scan" ? "Worth scanning" : "Low priority";
              const sectionItems = baseRenderData.filter((cluster) => cluster.priority === priority);

              return (
                <section key={priority} className="priority-section">
                  <h2>{title}</h2>
                  {sectionItems.length === 0 ? <p className="empty-copy">No stories in this section for this date/settings.</p> : (
                    <div className="cluster-grid">
                      {sectionItems.map((cluster) => {
                        const isRead = readIds.includes(cluster.cluster_id);
                        const isBookmarked = bookmarkedIds.includes(cluster.cluster_id);
                        return (
                          <article key={cluster.cluster_id} className={`story-card ${isRead ? "is-read" : ""}`}>
                            <div className="story-heading">
                              <img className="story-thumb" src={cluster.best_article.image_url || faviconUrl(cluster.best_article.source_domain)} alt={`${cluster.best_article.source_domain} source icon`} loading="lazy" />
                              <h3>{cluster.title}</h3>
                            </div>

                            <a href={cluster.best_article.url} target="_blank" rel="noreferrer">Best Source: {cluster.best_article.source_domain}</a>

                            <div className="label-row">
                              <span className={`label-${cluster.best_article.labels.reliability.toLowerCase()}`}>{cluster.best_article.labels.reliability} reliability</span>
                              <span>{cluster.best_article.labels.bias_label ?? "No bias label"}</span>
                              <span>{cluster.coverage_breadth} coverage</span>
                              <span>{relativeTime(cluster.updated_at)}</span>
                            </div>

                            <p className="trace">Why this link: {cluster.best_article.trace_summary}</p>

                            <div className="actions">
                              <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setActiveDetailTab("coverage"); }}>Coverage</button>
                              <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setActiveDetailTab("why"); }}>Why this link</button>
                              <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setAssessment(null); setActiveDetailTab("assessment"); }}>Assessment</button>
                              <button type="button" onClick={() => setReadIds((ids) => ids.includes(cluster.cluster_id) ? ids.filter((id) => id !== cluster.cluster_id) : [...ids, cluster.cluster_id])}>{isRead ? "Mark unread" : "Mark read"}</button>
                              <button type="button" className={isBookmarked ? "bookmarked" : ""} onClick={() => setBookmarkedIds((ids) => ids.includes(cluster.cluster_id) ? ids.filter((id) => id !== cluster.cluster_id) : [...ids, cluster.cluster_id])}>{isBookmarked ? "★ Bookmarked" : "☆ Bookmark"}</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {selectedCluster ? (
              <section className="detail-panel" aria-live="polite">
                <div className="detail-header">
                  <h2>Story details</h2>
                  <button type="button" onClick={() => setSelectedClusterId(null)}>Close</button>
                </div>
                <p className="detail-title">{selectedCluster.title}</p>

                <div className="detail-tabs" role="tablist" aria-label="Story details tabs">
                  {(Object.keys(DETAIL_TAB_LABELS) as StoryDetailTab[]).map((tab) => (
                    <button key={tab} type="button" role="tab" aria-selected={activeDetailTab === tab} className={`detail-tab ${activeDetailTab === tab ? "active" : ""}`} onClick={() => { if (tab === "assessment") setAssessment(null); setActiveDetailTab(tab); }}>
                      {DETAIL_TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>

                {activeDetailTab === "coverage" ? (
                  <div className="detail-content">
                    <div className="coverage-matrix">
                      <div>
                        <h4>Region coverage</h4>
                        <ul>{Object.entries(coverageSummary.byRegion).map(([region, count]) => <li key={region}>{region}: {count}</li>)}</ul>
                      </div>
                      <div>
                        <h4>Bias coverage</h4>
                        <ul>{Object.entries(coverageSummary.byBias).map(([bias, count]) => <li key={bias}>{bias}: {count}</li>)}</ul>
                      </div>
                    </div>

                    <h4>Headline comparison</h4>
                    {selectedCluster.articles.map((article) => (
                      <article key={article.url} className="coverage-item">
                        <h3>{article.title}</h3>
                        <p><strong>Source:</strong> {article.source_domain}</p>
                        <p><strong>Timestamp:</strong> {new Date(article.timestamp).toLocaleString()}</p>
                        <p>{article.snippet}</p>
                        <a href={article.url} target="_blank" rel="noreferrer">Open article</a>
                      </article>
                    ))}

                    <h4>Blind spots</h4>
                    {coverageSummary.blindSpots.length > 0 ? <p>{coverageSummary.blindSpots.join(", ")}</p> : <p>No blind spots among tracked outlets.</p>}
                  </div>
                ) : null}

                {activeDetailTab === "why" ? (
                  <div className="detail-content">
                    <p>{selectedCluster.best_article.trace_summary}</p>
                    <ul>
                      <li>Reliability: {selectedCluster.best_article.labels.reliability}</li>
                      <li>Bias label: {selectedCluster.best_article.labels.bias_label ?? "Not set"}</li>
                      <li>Paywall: {selectedCluster.best_article.labels.paywall}</li>
                      <li>Region: {selectedCluster.best_article.labels.region ?? "Not set"}</li>
                    </ul>
                    <h4>Next best options</h4>
                    {selectedAlternatives.map((alt) => (
                      <div key={alt.article.url} className="alt-item">
                        <p><strong>{alt.article.title}</strong></p>
                        <p>{alt.article.source_domain} · {alt.reason}</p>
                      </div>
                    ))}
                    <p className="what-if">What-if: if you change source weights or paywall mode in Settings/Sources, this pick can change immediately.</p>
                  </div>
                ) : null}

                {activeDetailTab === "assessment" ? (
                  <div className="detail-content">
                    {assessment ? (
                      <>
                        <h4>What happened</h4>
                        <ul>{assessment.what_happened.map((item) => <li key={item}>{item}</li>)}</ul>
                        <h4>Why it matters</h4>
                        <ul>{assessment.why_it_matters.map((item) => <li key={item}>{item}</li>)}</ul>
                        <p><strong>Watch next:</strong> {assessment.what_to_watch.decision_point} ({assessment.what_to_watch.deadline})</p>
                      </>
                    ) : (
                      <p>Assessment not yet available for this story. Placeholder mode is active in MVP-2.</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {!loading && activeTab === "sources" ? (
          <div className="placeholder">
            <h2>Sources</h2>
            <p>Adjust per-outlet weighting and apply presets that affect Best Source selection.</p>
            <div className="preset-row">
              {Object.keys(PRESETS).map((preset) => (
                <button key={preset} type="button" onClick={() => setSettings((current) => ({ ...current, ...PRESETS[preset], sourceWeights: { ...current.sourceWeights, ...(PRESETS[preset].sourceWeights ?? {}) } }))}>
                  {preset}
                </button>
              ))}
            </div>

            <label className="settings-row"><span>Minimum reliability</span><select value={settings.minReliability} onChange={(event) => setSettings((current) => ({ ...current, minReliability: event.target.value as Labels["reliability"] }))}><option value="Low">Low</option><option value="Med">Med</option><option value="High">High</option></select></label>
            <label className="settings-row"><span>Paywall handling</span><select value={settings.paywallMode} onChange={(event) => setSettings((current) => ({ ...current, paywallMode: event.target.value as PaywallMode }))}><option value="allow">Allow</option><option value="downrank">Downrank</option><option value="hide">Hide</option></select></label>

            <div className="settings-grid">
              {sourcesMeta.map((source) => (
                <div key={source.domain} className="source-card">
                  <p><strong>{source.domain}</strong></p>
                  <p>Reliability: {source.reliability_score}/100 · Region: {source.region}</p>
                  <p>Tags: {source.tags.join(", ")} · Bias: {source.bias_label ?? "Unknown"}</p>
                  <p>Max links/day: {source.max_links_per_day ?? "-"}</p>
                  <select value={settings.sourceWeights[source.domain] ?? source.user_weight ?? "normal"} onChange={(event) => setSettings((current) => ({ ...current, sourceWeights: { ...current.sourceWeights, [source.domain]: event.target.value as SourceWeight } }))}>
                    <option value="hide">Hide</option><option value="normal">Normal</option><option value="boost">Boost</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && activeTab === "archive" ? (
          <div className="placeholder">
            <h2>Archive</h2>
            <div className="archive-controls">
              <button type="button" onClick={() => setArchiveDate(todayData?.date ?? null)}>Jump to today</button>
              <select value={archiveDate ?? ""} onChange={(event) => setArchiveDate(event.target.value || null)}>
                <option value="">Choose date</option>
                {archiveIndex.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>
            <p>{archiveDate ? `Viewing archive for ${archiveDate}` : "Select a date to browse past briefs."}</p>
          </div>
        ) : null}

        {!loading && activeTab === "settings" ? (
          <div className="placeholder">
            <h2>Settings</h2>
            <details open>
              <summary>Feed Display</summary>
              <div className="settings-grid">
                <label className="settings-row"><span>Stories per day</span><input type="number" min={5} max={100} value={settings.storiesPerDay} onChange={(event) => setSettings((current) => ({ ...current, storiesPerDay: Number(event.target.value) || 20 }))} /></label>
                <label className="settings-row"><span>Top count</span><input type="number" min={1} max={30} value={settings.topCount} onChange={(event) => setSettings((current) => ({ ...current, topCount: Number(event.target.value) || 5 }))} /></label>
                <label className="settings-row"><span>Scan count</span><input type="number" min={1} max={60} value={settings.scanCount} onChange={(event) => setSettings((current) => ({ ...current, scanCount: Number(event.target.value) || 10 }))} /></label>
              </div>
            </details>

            <details open>
              <summary>Filtering & Ranking</summary>
              <div className="settings-grid">
                {Object.keys(settings.regionWeights).map((region) => (
                  <label key={region} className="settings-row">
                    <span>{region} weight</span>
                    <input type="range" min={0} max={2} step={0.1} value={settings.regionWeights[region]} onChange={(event) => setSettings((current) => ({ ...current, regionWeights: { ...current.regionWeights, [region]: Number(event.target.value) } }))} />
                  </label>
                ))}
                <label className="settings-row"><span>Archive retention</span><select value={settings.archiveRetentionDays} onChange={(event) => setSettings((current) => ({ ...current, archiveRetentionDays: Number(event.target.value) as FeedSettings["archiveRetentionDays"] }))}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></label>
              </div>
            </details>

            <details open>
              <summary>Appearance</summary>
              <div className="settings-grid">
                <label className="settings-row"><span>Theme</span><select value={settings.theme} onChange={(event) => setSettings((current) => ({ ...current, theme: event.target.value as ThemeMode }))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
                <label className="settings-row"><span>Font size</span><input type="range" min={14} max={20} value={settings.fontSize} onChange={(event) => setSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label>
                <label className="settings-row"><span>Compact mode</span><input type="checkbox" checked={settings.compactMode} onChange={(event) => setSettings((current) => ({ ...current, compactMode: event.target.checked }))} /></label>
                <label className="settings-row"><span>Default tab</span><select value={settings.defaultTab} onChange={(event) => setSettings((current) => ({ ...current, defaultTab: event.target.value as TabKey }))}>{(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => <option key={tab} value={tab}>{TAB_LABELS[tab]}</option>)}</select></label>
              </div>
            </details>

            <details open>
              <summary>Topics and Keywords</summary>
              <div className="chips-editor">
                <h3>Keyword mutes</h3>
                <div className="chips-input"><input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} /><button type="button" onClick={() => {
                  const value = keywordInput.trim().toLowerCase();
                  if (!value) return;
                  setSettings((current) => ({ ...current, keywordMutes: Array.from(new Set([...current.keywordMutes, value])) }));
                  setKeywordInput("");
                }}>Add</button></div>
                <div className="chips">{settings.keywordMutes.map((keyword) => <button key={keyword} type="button" onClick={() => setSettings((current) => ({ ...current, keywordMutes: current.keywordMutes.filter((item) => item !== keyword) }))}>{keyword} ×</button>)}</div>

                <h3>Topic boosts</h3>
                <div className="chips-input"><input value={topicInput} onChange={(e) => setTopicInput(e.target.value)} /><button type="button" onClick={() => {
                  const value = topicInput.trim().toLowerCase();
                  if (!value) return;
                  setSettings((current) => ({ ...current, topicBoosts: Array.from(new Set([...current.topicBoosts, value])) }));
                  setTopicInput("");
                }}>Add</button></div>
                <div className="chips">{settings.topicBoosts.map((topic) => <button key={topic} type="button" onClick={() => setSettings((current) => ({ ...current, topicBoosts: current.topicBoosts.filter((item) => item !== topic) }))}>{topic} ×</button>)}</div>
              </div>
            </details>

            <details open>
              <summary>Data Controls</summary>
              <div className="settings-grid">
                <button type="button" onClick={() => {
                  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "briefboard-settings.json";
                  link.click();
                  URL.revokeObjectURL(url);
                }}>Export settings</button>
                <button type="button" onClick={() => {
                  const exportPayload = { settings, todayData, archiveIndex };
                  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "briefboard-data-export.json";
                  link.click();
                  URL.revokeObjectURL(url);
                }}>Export all data</button>
                <button type="button" onClick={() => window.confirm("Clear all read history?") && setReadIds([])}>Clear read history</button>
                <button type="button" onClick={() => window.confirm("Clear all bookmarks?") && setBookmarkedIds([])}>Clear bookmarks</button>
              </div>
            </details>
          </div>
        ) : null}
      </section>
    </main>
  );
}
