import { useEffect, useState } from "react";

type Today = {
  date: string;
  generated_at: string;
  clusters: Array<{
    cluster_id: string;
    title: string;
    best_article?: { url: string; source_domain: string };
    articles: Array<{ url: string; title: string; source_domain: string }>;
  }>;
};

export default function App() {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/today.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load today.json (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ margin: "0 0 12px 0" }}>Personal Newsfeed</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button>Daily Brief</button>
        <button>Sources</button>
        <button>Archive</button>
        <button>Settings</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!error && !data && <p>Loading…</p>}

      {data && (
        <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ marginBottom: 10 }}>
            <div><strong>Date:</strong> {data.date}</div>
            <div><strong>Generated:</strong> {data.generated_at}</div>
            <div><strong>Story clusters:</strong> {data.clusters.length}</div>
          </div>

          {data.clusters.length === 0 ? (
            <p style={{ margin: 0 }}>
              No stories yet. Next step: generate this file daily from RSS.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.clusters.map((c) => (
                <li key={c.cluster_id}>
                  {c.title}{" "}
                  {c.best_article?.url ? (
                    <a href={c.best_article.url} target="_blank" rel="noreferrer">
                      (Best Source)
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
