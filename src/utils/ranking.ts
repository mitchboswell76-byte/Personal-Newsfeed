import type { DerivedCluster, FeedSettings, Today } from "../types";
import { chooseBestArticle } from "./scoring";

export function deriveClusters(data: Today, settings: FeedSettings): DerivedCluster[] {
  const mutes = settings.keywordMutes.map((k) => k.toLowerCase());
  const boosts = settings.topicBoosts.map((k) => k.toLowerCase());

  return data.clusters
    .map((cluster) => {
      const { best, trace, alternatives } = chooseBestArticle(cluster, settings);
      const recencyScore = Math.max(0, 72 - (Date.now() - new Date(cluster.updated_at).getTime()) / 3_600_000);
      const outletCount = new Set(cluster.articles.map((a) => a.source_domain)).size;
      const regionSet = new Set(cluster.articles.map((a) => a.labels.region ?? "Global"));
      const regionBoost =
        Array.from(regionSet).reduce((sum, region) => sum + (settings.regionWeights[region] ?? 0.7), 0) /
        regionSet.size;
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
        alternatives,
      };
    })
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, settings.storiesPerDay)
    .map((cluster, index) => ({
      ...cluster,
      priority: index < settings.topCount ? "top" : index < settings.topCount + settings.scanCount ? "scan" : "low",
    }));
}
