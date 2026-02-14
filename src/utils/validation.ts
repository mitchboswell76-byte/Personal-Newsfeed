import type { Today } from "../types";

export function validateTodayJson(payload: unknown): payload is Today {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Today;
  if (!candidate.date || !candidate.generated_at || !Array.isArray(candidate.clusters)) return false;
  for (const cluster of candidate.clusters) {
    if (!cluster.cluster_id || !cluster.title || !cluster.best_article?.url || !Array.isArray(cluster.articles)) {
      return false;
    }
  }
  return true;
}
