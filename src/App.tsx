import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Priority = "top" | "scan" | "low";
type TabKey = "brief" | "sources" | "archive" | "settings";

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

const PRIORITY_SECTIONS: Array<{ key: Priority; title: string }> = [
  { key: "top", title: "Top priority" },
  { key: "scan", title: "Worth scanning" },
  { key: "low", title: "Low priority" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("brief");
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);

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
        <p className="eyebrow">BriefBoard · MVP-0</p>
        <h1>Personal News Feed</h1>
        <p className="subtitle">Mock JSON + UI skeleton before RSS integration.</p>
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
                              <h3>{cluster.title}</h3>

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
                                <button type="button">Coverage</button>
                                <button type="button">Why this link</button>
                                <button type="button">Assessment</button>
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
