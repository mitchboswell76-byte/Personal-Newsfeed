import type { Article, Cluster, FeedSettings, SourceWeight } from "../types";

function reliabilityValue(value: "High" | "Med" | "Low") {
  if (value === "High") return 3;
  if (value === "Med") return 2;
  return 1;
}

function sourceWeightValue(weight: SourceWeight) {
  if (weight === "boost") return 1;
  if (weight === "hide") return -3;
  return 0;
}

function sensationalismPenalty(title: string) {
  let penalty = 0;
  if (/\b(SHOCKING|EXPLOSIVE|STUNNING|BOMBSHELL|EXCLUSIVE)\b/i.test(title)) penalty += 0.3;
  if ((title.match(/!/g) || []).length > 1) penalty += 0.2;
  if (/^[A-Z\s]{18,}$/.test(title)) penalty += 0.3;
  return penalty;
}

export function chooseBestArticle(cluster: Cluster, settings: FeedSettings): { best: Article; trace: string; alternatives: Array<{ article: Article; reason: string }> } {
  const scored = cluster.articles
    .map((article) => {
      const sourceWeight = settings.sourceWeights[article.source_domain] ?? "normal";
      const reliability = reliabilityValue(article.labels.reliability);
      const freshness = Math.max(0, 48 - (Date.now() - new Date(article.timestamp).getTime()) / 3_600_000) / 24;
      const sensational = sensationalismPenalty(article.title);
      const paywallPenalty =
        settings.paywallMode === "hide" && article.labels.paywall === "Yes"
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
    })
    .sort((a, b) => b.score - a.score);

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
