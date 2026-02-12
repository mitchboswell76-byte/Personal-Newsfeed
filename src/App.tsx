import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Priority = "top" | "scan" | "low";
type TabKey = "brief" | "sources" | "archive" | "settings";
type StoryDetailTab = "coverage" | "why" | "assessment";
type PaywallMode = "allow" | "downrank" | "hide";
type SourceWeight = "hide" | "normal" | "boost";

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

type Cluster = {
  cluster_id: string;
  rank_score: number;
  priority: Priority;
  title: string;
  topic_tags: string[];
  updated_at: string;
  coverage_breadth: "Narrow" | "Medium" | "Broad";
  best_article: {
    url: string;
    source_domain: string;
    image_url?: string;
    labels: Labels;
    trace_summary: string;
  };
  articles: Article[];
};

type Today = {
  date: string;
  generated_at: string;
  clusters: Cluster[];
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
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    readFromStorage<TabKey>(ACTIVE_TAB_KEY, "brief"),
  );
  const [activeDetailTab, setActiveDetailTab] = useState<StoryDetailTab>(() =>
    readFromStorage<StoryDetailTab>(DETAIL_TAB_KEY, "coverage"),
  );
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(() =>
    readFromStorage<string | null>(DETAIL_STORY_KEY, null),
  );
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>(() => readFromStorage<string[]>(READ_IDS_KEY, []));
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => readFromStorage<string[]>(BOOKMARK_IDS_KEY, []));
  const [settings, setSettings] = useState<FeedSettings>(() => readFromStorage<FeedSettings>(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [keywordInput, setKeywordInput] = useState("");
  const [topicInput, setTopicInput] = useState("");

  useEffect(() => {
    fetch("/data/today.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load /data/today.json (${response.status}).`);
        }
        return response.json();
      })
      .then((payload: Today) => setData(payload))
      .catch((err) => setError(String(err?.message ?? err)));
  }, []);

  useEffect(() => window.localStorage.setItem(READ_IDS_KEY, JSON.stringify(readIds)), [readIds]);
  useEffect(() => window.localStorage.setItem(BOOKMARK_IDS_KEY, JSON.stringify(bookmarkedIds)), [bookmarkedIds]);
  useEffect(() => window.localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeTab)), [activeTab]);
  useEffect(() => window.localStorage.setItem(DETAIL_TAB_KEY, JSON.stringify(activeDetailTab)), [activeDetailTab]);
  useEffect(() => window.localStorage.setItem(DETAIL_STORY_KEY, JSON.stringify(selectedClusterId)), [selectedClusterId]);
  useEffect(() => window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);

  const clusters = useMemo(() => (data ? deriveClusters(data, settings) : []), [data, settings]);

  const selectedCluster = useMemo(
    () => clusters.find((cluster) => cluster.cluster_id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  const progress = useMemo(() => {
    if (clusters.length === 0) {
      return { read: 0, total: 0, done: false };
    }

    const read = clusters.filter((cluster) => readIds.includes(cluster.cluster_id)).length;
    return {
      read,
      total: clusters.length,
      done: read === clusters.length,
    };
  }, [clusters, readIds]);

  const sourceDomains = useMemo(
    () => Array.from(new Set(clusters.flatMap((cluster) => cluster.articles.map((article) => article.source_domain)))).sort(),
    [clusters],
  );

  const updateSourceWeight = (domain: string, weight: SourceWeight) => {
    setSettings((current) => ({
      ...current,
      sourceWeights: {
        ...current.sourceWeights,
        [domain]: weight,
      },
    }));
  };

  const addKeywordMute = () => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (!trimmed) return;
    setSettings((current) => ({
      ...current,
      keywordMutes: Array.from(new Set([...current.keywordMutes, trimmed])),
    }));
    setKeywordInput("");
  };

  const addTopicBoost = () => {
    const trimmed = topicInput.trim().toLowerCase();
    if (!trimmed) return;
    setSettings((current) => ({
      ...current,
      topicBoosts: Array.from(new Set([...current.topicBoosts, trimmed])),
    }));
    setTopicInput("");
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">BriefBoard · MVP-2</p>
        <h1>Personal News Feed</h1>
        <p className="subtitle">Clustering, ranking, and best-source selection now react to your settings.</p>
      </header>

      <nav className="tab-nav" aria-label="Main sections">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <button key={tab} type="button" className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {error ? <p className="error">{error}</p> : null}
      {!error && !data ? <p className="loading">Loading Daily Brief…</p> : null}

      {!error && data ? (
        <section className="panel">
          {activeTab === "brief" ? (
            <>
              <div className="daily-meta">
                <p><strong>Date:</strong> {data.date}</p>
                <p><strong>Generated:</strong> {new Date(data.generated_at).toLocaleString()}</p>
                <p><strong>Progress:</strong> {progress.read}/{progress.total} read</p>
              </div>

              {progress.done ? <p className="done-banner">Done for today ✅</p> : null}

              {(["top", "scan", "low"] as Priority[]).map((priority) => {
                const sectionTitle = priority === "top" ? "Top priority" : priority === "scan" ? "Worth scanning" : "Low priority";
                const sectionClusters = clusters.filter((cluster) => cluster.priority === priority);

                return (
                  <section key={priority} className="priority-section">
                    <h2>{sectionTitle}</h2>
                    {sectionClusters.length === 0 ? <p className="empty-copy">No stories in this section.</p> : (
                      <div className="cluster-grid">
                        {sectionClusters.map((cluster) => {
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
                                <span>{cluster.best_article.labels.reliability} reliability</span>
                                <span>{cluster.best_article.labels.bias_label ?? "No bias label"}</span>
                                <span>{cluster.coverage_breadth} coverage</span>
                                <span>{formatTimestamp(cluster.updated_at)}</span>
                              </div>

                              <p className="trace">Why this link: {cluster.best_article.trace_summary}</p>

                              <div className="actions">
                                <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setActiveDetailTab("coverage"); }}>Coverage</button>
                                <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setActiveDetailTab("why"); }}>Why this link</button>
                                <button type="button" onClick={() => { setSelectedClusterId(cluster.cluster_id); setActiveDetailTab("assessment"); }}>Assessment</button>
                                <button type="button" onClick={() => setReadIds((c) => c.includes(cluster.cluster_id) ? c.filter((id) => id !== cluster.cluster_id) : [...c, cluster.cluster_id])}>{isRead ? "Mark unread" : "Mark read"}</button>
                                <button type="button" className={isBookmarked ? "bookmarked" : ""} onClick={() => setBookmarkedIds((c) => c.includes(cluster.cluster_id) ? c.filter((id) => id !== cluster.cluster_id) : [...c, cluster.cluster_id])}>{isBookmarked ? "★ Bookmarked" : "☆ Bookmark"}</button>
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
                      <button key={tab} type="button" role="tab" aria-selected={activeDetailTab === tab} className={`detail-tab ${activeDetailTab === tab ? "active" : ""}`} onClick={() => setActiveDetailTab(tab)}>
                        {DETAIL_TAB_LABELS[tab]}
                      </button>
                    ))}
                  </div>

                  {activeDetailTab === "coverage" ? <div className="detail-content">{selectedCluster.articles.map((article) => (
                    <article key={article.url} className="coverage-item">
                      <h3>{article.title}</h3>
                      <p><strong>Source:</strong> {article.source_domain}</p>
                      <p><strong>Timestamp:</strong> {formatTimestamp(article.timestamp)}</p>
                      <p>{article.snippet}</p>
                      <a href={article.url} target="_blank" rel="noreferrer">Open article</a>
                    </article>
                  ))}</div> : null}

                  {activeDetailTab === "why" ? <div className="detail-content"><p>{selectedCluster.best_article.trace_summary}</p><ul><li>Reliability: {selectedCluster.best_article.labels.reliability}</li><li>Bias label: {selectedCluster.best_article.labels.bias_label ?? "Not set"}</li><li>Paywall: {selectedCluster.best_article.labels.paywall}</li><li>Region: {selectedCluster.best_article.labels.region ?? "Not set"}</li></ul></div> : null}

                  {activeDetailTab === "assessment" ? <div className="detail-content"><p>Assessment is still placeholder-only in MVP-2. Structured context comes in a later milestone.</p></div> : null}
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === "sources" ? (
            <div className="placeholder">
              <h2>Sources</h2>
              <p>Set hide / normal / boost per outlet. This now directly affects Best Source selection.</p>
              <div className="settings-grid">
                {sourceDomains.map((domain) => (
                  <label key={domain} className="settings-row">
                    <span>{domain}</span>
                    <select value={settings.sourceWeights[domain] ?? "normal"} onChange={(event) => updateSourceWeight(domain, event.target.value as SourceWeight)}>
                      <option value="hide">Hide</option>
                      <option value="normal">Normal</option>
                      <option value="boost">Boost</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "archive" ? (
            <div className="placeholder">
              <h2>Archive</h2>
              <p>Archive index UI is still out of scope for MVP-2.</p>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="placeholder">
              <h2>Settings</h2>
              <div className="settings-grid">
                <label className="settings-row"><span>Stories per day</span><input type="number" min={5} max={100} value={settings.storiesPerDay} onChange={(event) => setSettings((c) => ({ ...c, storiesPerDay: Number(event.target.value) || 20 }))} /></label>
                <label className="settings-row"><span>Top priority count</span><input type="number" min={1} max={30} value={settings.topCount} onChange={(event) => setSettings((c) => ({ ...c, topCount: Number(event.target.value) || 5 }))} /></label>
                <label className="settings-row"><span>Worth scanning count</span><input type="number" min={1} max={50} value={settings.scanCount} onChange={(event) => setSettings((c) => ({ ...c, scanCount: Number(event.target.value) || 10 }))} /></label>
                <label className="settings-row"><span>Minimum reliability</span><select value={settings.minReliability} onChange={(event) => setSettings((c) => ({ ...c, minReliability: event.target.value as Labels["reliability"] }))}><option value="Low">Low</option><option value="Med">Med</option><option value="High">High</option></select></label>
                <label className="settings-row"><span>Paywall handling</span><select value={settings.paywallMode} onChange={(event) => setSettings((c) => ({ ...c, paywallMode: event.target.value as PaywallMode }))}><option value="allow">Allow</option><option value="downrank">Downrank</option><option value="hide">Hide</option></select></label>
              </div>

              <div className="chips-editor">
                <h3>Keyword mutes</h3>
                <div className="chips-input"><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="e.g. celebrity" /><button type="button" onClick={addKeywordMute}>Add</button></div>
                <div className="chips">{settings.keywordMutes.map((keyword) => <button key={keyword} type="button" onClick={() => setSettings((c) => ({ ...c, keywordMutes: c.keywordMutes.filter((item) => item !== keyword) }))}>{keyword} ×</button>)}</div>
              </div>

              <div className="chips-editor">
                <h3>Topic boosts</h3>
                <div className="chips-input"><input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} placeholder="e.g. general" /><button type="button" onClick={addTopicBoost}>Add</button></div>
                <div className="chips">{settings.topicBoosts.map((topic) => <button key={topic} type="button" onClick={() => setSettings((c) => ({ ...c, topicBoosts: c.topicBoosts.filter((item) => item !== topic) }))}>{topic} ×</button>)}</div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
