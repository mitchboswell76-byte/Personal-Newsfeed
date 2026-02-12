import { readFile, writeFile } from "node:fs/promises";

const FEEDS_PATH = new URL(process.env.RSS_FEEDS_PATH ?? "../config/rss-feeds.json", import.meta.url);
const SOURCES_PATH = new URL("../config/sources.json", import.meta.url);
const OUTPUT_PATH = new URL("../public/data/today.json", import.meta.url);

const MAX_STORIES = Number(process.env.MAX_STORIES ?? "40");
const FETCH_TIMEOUT_MS = Number(process.env.RSS_TIMEOUT_MS ?? "12000");
const USE_MOCK_RSS = process.env.USE_MOCK_RSS === "1";

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(xml, patterns) {
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"]) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[|–—-]\s*(reuters|associated press|ap|bbc|guardian|nytimes|cnn).*$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function toIsoDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function scoreToPriority(index, total) {
  if (total === 0) return "low";
  const ratio = (index + 1) / total;
  if (ratio <= 0.34) return "top";
  if (ratio <= 0.7) return "scan";
  return "low";
}

function reliabilityBucket(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Med";
  return "Low";
}

function parseItems(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  if (items?.length) return items;
  return xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
}

function parseRssItem(rawItem, feed, sourceMetaByDomain) {
  const url = firstMatch(rawItem, [
    /<link[^>]*>([\s\S]*?)<\/link>/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i,
    /<id[^>]*>([\s\S]*?)<\/id>/i,
  ]);
  const title = firstMatch(rawItem, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const snippet = firstMatch(rawItem, [
    /<description[^>]*>([\s\S]*?)<\/description>/i,
    /<summary[^>]*>([\s\S]*?)<\/summary>/i,
    /<content[^>]*>([\s\S]*?)<\/content>/i,
  ]);
  const publishedAt = firstMatch(rawItem, [
    /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
    /<published[^>]*>([\s\S]*?)<\/published>/i,
    /<updated[^>]*>([\s\S]*?)<\/updated>/i,
  ]);

  if (!url || !title) return null;

  const cleanedUrl = canonicalUrl(url);
  const sourceDomain = toDomain(cleanedUrl);
  const sourceMeta = sourceMetaByDomain.get(sourceDomain);
  const reliabilityScore = sourceMeta?.reliability_score ?? 65;

  return {
    url: cleanedUrl,
    title,
    normalized_title: normalizeTitle(title),
    source_domain: sourceDomain,
    timestamp: toIsoDate(publishedAt),
    snippet: snippet || `${feed.name} coverage`,
    labels: {
      reliability: reliabilityBucket(reliabilityScore),
      reliability_score: reliabilityScore,
      region: sourceMeta?.region ?? feed.region ?? "Global",
      paywall: "No",
      bias_label: sourceMeta?.bias_label ?? feed.bias_label ?? "Center",
    },
    feedName: feed.name,
  };
}

async function fetchXmlFromNetwork(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BriefBoard-MVP1.1/1.0 (+https://github.com)",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchXmlFromMock(feed) {
  const fileName = feed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = new URL(`../scripts/mock-feeds/${fileName}.xml`, import.meta.url);
  return readFile(path, "utf8");
}

async function fetchFeedItems(feed, sourceMetaByDomain) {
  const xml = USE_MOCK_RSS ? await fetchXmlFromMock(feed) : await fetchXmlFromNetwork(feed);
  return parseItems(xml)
    .map((item) => parseRssItem(item, feed, sourceMetaByDomain))
    .filter(Boolean);
}

function dedupeItems(items) {
  const byUrl = new Map();
  for (const item of items) {
    if (!byUrl.has(item.url)) {
      byUrl.set(item.url, item);
    }
  }

  const nearKeyMap = new Map();
  for (const item of byUrl.values()) {
    const hourBucket = item.timestamp.slice(0, 13);
    const nearKey = `${item.normalized_title}|${hourBucket}`;
    const existing = nearKeyMap.get(nearKey);

    if (!existing) {
      nearKeyMap.set(nearKey, item);
      continue;
    }

    const existingScore = existing.labels.reliability_score;
    const currentScore = item.labels.reliability_score;

    const shouldReplace =
      currentScore > existingScore ||
      (currentScore === existingScore && new Date(item.timestamp).getTime() > new Date(existing.timestamp).getTime());

    if (shouldReplace) {
      nearKeyMap.set(nearKey, item);
    }
  }

  return Array.from(nearKeyMap.values());
}

function toTodayJson(items) {
  const deduped = dedupeItems(items)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_STORIES);

  const total = deduped.length;
  const clusters = deduped.map((item, index) => ({
    cluster_id: `rss-${index + 1}`,
    rank_score: Number((1 - index / Math.max(total, 1)).toFixed(3)),
    priority: scoreToPriority(index, total),
    title: item.title,
    topic_tags: ["general"],
    updated_at: item.timestamp,
    coverage_breadth: "Narrow",
    best_article: {
      url: item.url,
      source_domain: item.source_domain,
      image_url:
        index === 0
          ? "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=128&q=60"
          : "",
      labels: {
        reliability: item.labels.reliability,
        paywall: "No",
        bias_label: item.labels.bias_label,
        region: item.labels.region,
      },
      trace_summary: `Picked from ${item.feedName} after URL + near-duplicate filtering and recency ranking.`,
    },
    articles: [
      {
        url: item.url,
        title: item.title,
        source_domain: item.source_domain,
        timestamp: item.timestamp,
        snippet: item.snippet,
        labels: {
          reliability: item.labels.reliability,
          region: item.labels.region,
          paywall: item.labels.paywall,
          bias_label: item.labels.bias_label,
        },
      },
    ],
  }));

  clusters.sort((a, b) => {
    if (b.rank_score !== a.rank_score) {
      return b.rank_score - a.rank_score;
    }

    const updatedDelta = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return a.title.localeCompare(b.title);
  });

  return {
    date: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    clusters,
  };
}

function validateTodayJson(payload) {
  if (!payload || typeof payload !== "object") throw new Error("today.json must be an object.");
  if (typeof payload.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    throw new Error("today.json date is missing or not in YYYY-MM-DD format.");
  }
  if (typeof payload.generated_at !== "string" || Number.isNaN(Date.parse(payload.generated_at))) {
    throw new Error("today.json generated_at is missing or invalid.");
  }
  if (!Array.isArray(payload.clusters)) {
    throw new Error("today.json clusters must be an array.");
  }

  payload.clusters.forEach((cluster, index) => {
    if (!cluster?.cluster_id) throw new Error(`clusters[${index}].cluster_id is required.`);
    if (!cluster?.best_article?.url) throw new Error(`clusters[${index}].best_article.url is required.`);
    if (!Array.isArray(cluster.articles)) throw new Error(`clusters[${index}].articles must be an array.`);
    cluster.articles.forEach((article, articleIndex) => {
      if (!article?.url) throw new Error(`clusters[${index}].articles[${articleIndex}].url is required.`);
      if (!article?.title) throw new Error(`clusters[${index}].articles[${articleIndex}].title is required.`);
    });
  });
}

function validateSourceMetadata(sources) {
  if (!Array.isArray(sources)) {
    throw new Error("config/sources.json must be an array.");
  }

  sources.forEach((source, index) => {
    if (!source.domain) throw new Error(`sources[${index}].domain is required.`);
    if (typeof source.reliability_score !== "number") {
      throw new Error(`sources[${index}].reliability_score must be a number.`);
    }
  });
}

async function main() {
  const feeds = JSON.parse(await readFile(FEEDS_PATH, "utf8"));
  const sources = JSON.parse(await readFile(SOURCES_PATH, "utf8"));
  validateSourceMetadata(sources);
  const sourceMetaByDomain = new Map(sources.map((source) => [source.domain, source]));

  const successes = [];
  const failures = [];

  for (const feed of feeds) {
    try {
      const items = await fetchFeedItems(feed, sourceMetaByDomain);
      successes.push(...items);
      console.log(`Fetched ${items.length} items from ${feed.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${feed.name} (${feed.url}): ${message}`);
      console.warn(`Feed failed: ${feed.name} (${feed.url}) -> ${message}`);
    }
  }

  if (successes.length === 0) {
    throw new Error(`All feeds failed. ${failures.join(" | ")}`);
  }

  const payload = toTodayJson(successes);
  validateTodayJson(payload);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Wrote ${payload.clusters.length} clusters to public/data/today.json`);
  if (failures.length > 0) {
    console.warn(`Build continued with partial feed failures: ${failures.join(" | ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
