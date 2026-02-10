import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Priority = "top" | "scan" | "low";
type TabKey = "brief" | "sources" | "archive" | "settings";
type StoryDetailTab = "coverage" | "why" | "assessment";

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

const PRIORITY_SECTIONS: Array<{ key: Priority; title: string }> = [
  { key: "top", title: "Top priority" },
  { key: "scan", title: "Worth scanning" },
  { key: "low", title: "Low priority" },
];

const READ_IDS_KEY = "pnf.readIds";
const BOOKMARK_IDS_KEY = "pnf.bookmarkedIds";

function readIdsFromStorage(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("brief");
  const [activeDetailTab, setActiveDetailTab] = useState<StoryDetailTab>("coverage");
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>(() => readIdsFromStorage(READ_IDS_KEY));
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => readIdsFromStorage(BOOKMARK_IDS_KEY));

  useEffect(() => {
    fetch("/data/today.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load today.json (${response.status})`);
        }
        return response.json();
      })
      .then((payload: Today) => setData(payload))
      .catch((err) => setError(String(err?.message ?? err)));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(READ_IDS_KEY, JSON.stringify(readIds));
  }, [readIds]);

  useEffect(() => {
    window.localStorage.setItem(BOOKMARK_IDS_KEY, JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  const selectedCluster = useMemo(() => {
    if (!data || !selectedClusterId) {
      return null;
    }

    return data.clusters.find((cluster) => cluster.cluster_id === selectedClusterId) ?? null;
  }, [data, selectedClusterId]);

  const progress = useMemo(() => {
    if (!data || data.clusters.length === 0) {
      return { read: 0, total: 0, done: false };
    }

    const read = data.clusters.filter((cluster) => readIds.includes(cluster.cluster_id)).length;
    return {
      read,
      total: data.clusters.length,
      done: read === data.clusters.length,
    };
  }, [data, readIds]);

  const openDetails = (clusterId: string, tab: StoryDetailTab) => {
    setSelectedClusterId(clusterId);
    setActiveDetailTab(tab);
  };

  const closeDetails = () => {
    setSelectedClusterId(null);
    setActiveDetailTab("coverage");
  };

  const toggleRead = (clusterId: string) => {
    setReadIds((current) =>
      current.includes(clusterId)
        ? current.filter((id) => id !== clusterId)
        : [...current, clusterId],
    );
  };

  const toggleBookmark = (clusterId: string) => {
    setBookmarkedIds((current) =>
      current.includes(clusterId)
        ? current.filter((id) => id !== clusterId)
        : [...current, clusterId],
    );
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">BriefBoard · MVP-0.1</p>
        <h1>Personal News Feed</h1>
        <p className="subtitle">Story details, persisted read state, and source icons.</p>
      </header>

      <nav className="tab-nav" aria-label="Main sections">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {error ? <p className="error">Error: {error}</p> : null}
      {!error && !data ? <p className="loading">Loading Daily Brief…</p> : null}

      {!error && data ? (
        <section className="panel">
          {activeTab === "brief" ? (
            <>
              <div className="daily-meta">
                <p>
                  <strong>Date:</strong> {data.date}
                </p>
                <p>
                  <strong>Generated:</strong> {new Date(data.generated_at).toLocaleString()}
                </p>
                <p>
                  <strong>Progress:</strong> {progress.read}/{progress.total} read
                </p>
              </div>

              {progress.done ? <p className="done-banner">Done for today ✅</p> : null}

              {PRIORITY_SECTIONS.map((section) => {
                const clusters = data.clusters.filter((cluster) => cluster.priority === section.key);

                return (
                  <section key={section.key} className="priority-section">
                    <h2>{section.title}</h2>
                    {clusters.length === 0 ? (
                      <p className="empty-copy">No stories in this section.</p>
                    ) : (
                      <div className="cluster-grid">
                        {clusters.map((cluster) => {
                          const isRead = readIds.includes(cluster.cluster_id);
                          const isBookmarked = bookmarkedIds.includes(cluster.cluster_id);

                          return (
                            <article key={cluster.cluster_id} className={`story-card ${isRead ? "is-read" : ""}`}>
                              <div className="story-heading">
                                <img
                                  className="story-thumb"
                                  src={cluster.best_article.image_url || faviconUrl(cluster.best_article.source_domain)}
                                  alt={`${cluster.best_article.source_domain} source icon`}
                                  loading="lazy"
                                />
                                <h3>{cluster.title}</h3>
                              </div>

                              <a href={cluster.best_article.url} target="_blank" rel="noreferrer">
                                Best Source: {cluster.best_article.source_domain}
                              </a>

                              <div className="label-row">
                                <span>{cluster.best_article.labels.reliability} reliability</span>
                                <span>{cluster.best_article.labels.bias_label ?? "No bias label"}</span>
                                <span>{cluster.coverage_breadth} coverage</span>
                                <span>{cluster.updated_at}</span>
                              </div>

                              <p className="trace">Why this link: {cluster.best_article.trace_summary}</p>

                              <div className="actions">
                                <button type="button" onClick={() => openDetails(cluster.cluster_id, "coverage")}>
                                  Coverage
                                </button>
                                <button type="button" onClick={() => openDetails(cluster.cluster_id, "why")}>
                                  Why this link
                                </button>
                                <button type="button" onClick={() => openDetails(cluster.cluster_id, "assessment")}>
                                  Assessment
                                </button>
                                <button type="button" onClick={() => toggleRead(cluster.cluster_id)}>
                                  {isRead ? "Mark unread" : "Mark read"}
                                </button>
                                <button type="button" onClick={() => toggleBookmark(cluster.cluster_id)}>
                                  {isBookmarked ? "Remove bookmark" : "Bookmark"}
                                </button>
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
                    <button type="button" onClick={closeDetails}>
                      Close
                    </button>
                  </div>

                  <p className="detail-title">{selectedCluster.title}</p>

                  <div className="detail-tabs" role="tablist" aria-label="Story details tabs">
                    {(Object.keys(DETAIL_TAB_LABELS) as StoryDetailTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeDetailTab === tab}
                        className={`detail-tab ${activeDetailTab === tab ? "active" : ""}`}
                        onClick={() => setActiveDetailTab(tab)}
                      >
                        {DETAIL_TAB_LABELS[tab]}
                      </button>
                    ))}
                  </div>

                  {activeDetailTab === "coverage" ? (
                    <div className="detail-content">
                      {selectedCluster.articles.map((article) => (
                        <article key={article.url} className="coverage-item">
                          <h3>{article.title}</h3>
                          <p>
                            <strong>Source:</strong> {article.source_domain}
                          </p>
                          <p>
                            <strong>Timestamp:</strong> {formatTimestamp(article.timestamp)}
                          </p>
                          <p>{article.snippet}</p>
                          <a href={article.url} target="_blank" rel="noreferrer">
                            Open article
                          </a>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {activeDetailTab === "why" ? (
                    <div className="detail-content">
                      <p>{selectedCluster.best_article.trace_summary}</p>
                      <ul>
                        <li>Reliability: {selectedCluster.best_article.labels.reliability}</li>
                        <li>Bias label: {selectedCluster.best_article.labels.bias_label ?? "Not set"}</li>
                        <li>Paywall: {selectedCluster.best_article.labels.paywall}</li>
                      </ul>
                    </div>
                  ) : null}

                  {activeDetailTab === "assessment" ? (
                    <div className="detail-content">
                      <p>
                        Assessment is a placeholder in MVP-0.1. Structured context (what happened, why it matters,
                        what to watch next, stakeholders, and open questions) will be added in a later milestone.
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === "sources" ? (
            <div className="placeholder">
              <h2>Sources</h2>
              <p>Outlet controls (hide / normal / boost), reliability threshold, and presets land in MVP-1+.</p>
            </div>
          ) : null}

          {activeTab === "archive" ? (
            <div className="placeholder">
              <h2>Archive</h2>
              <p>Daily archive listing and past brief navigation land in MVP-4.</p>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="placeholder">
              <h2>Settings</h2>
              <p>Story count, priority split, region weighting, and UI preferences land in MVP-2+.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
