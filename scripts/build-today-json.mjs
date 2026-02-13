import { mkdir, readFile, writeFile } from "node:fs/promises";

const FEEDS_PATH = new URL(process.env.RSS_FEEDS_PATH ?? "../config/rss-feeds.json", import.meta.url);
const SOURCES_PATH = new URL(process.env.SOURCES_PATH ?? "../config/sources.json", import.meta.url);
const OUTPUT_PATH = new URL("../public/data/today.json", import.meta.url);
const PUBLIC_DATA_DIR = new URL("../public/data/", import.meta.url);
const SOURCES_OUTPUT_PATH = new URL("../public/data/sources.json", import.meta.url);
const INDEX_OUTPUT_PATH = new URL("../public/data/index.json", import.meta.url);
const MOCK_FEEDS_DIR = process.env.MOCK_FEEDS_DIR ?? "../scripts/mock-feeds";

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

function canonicalUrl(url) {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[|–—-]\s*(reuters|associated press|ap|bbc|guardian|nytimes|cnn|fox|npr|wsj).*$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordsFromTitle(title) {
  return normalizeTitle(title)
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 8);
}

function overlapScore(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((item) => setB.has(item)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function parseItems(xml) {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
}

function firstMatch(xml, patterns) {
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function reliabilityBucket(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Med";
  return "Low";
}

function toDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function parseRssItem(rawItem, feed, sourcesByDomain) {
  const url = firstMatch(rawItem, [/<link[^>]*>([\s\S]*?)<\/link>/i, /<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i, /<id[^>]*>([\s\S]*?)<\/id>/i]);
  const title = firstMatch(rawItem, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const snippet = firstMatch(rawItem, [/<description[^>]*>([\s\S]*?)<\/description>/i, /<summary[^>]*>([\s\S]*?)<\/summary>/i]);
  const publishedAt = firstMatch(rawItem, [/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i, /<published[^>]*>([\s\S]*?)<\/published>/i, /<updated[^>]*>([\s\S]*?)<\/updated>/i]);
  if (!url || !title) return null;

  const canonical = canonicalUrl(url);
  const domain = toDomain(canonical);
  const source = sourcesByDomain.get(domain);
  const reliabilityScore = source?.reliability_score ?? 65;

  return {
    url: canonical,
    title,
    normalized_title: normalizeTitle(title),
    keywords: keywordsFromTitle(title),
    source_domain: domain,
    timestamp: new Date(publishedAt || Date.now()).toISOString(),
    snippet: snippet || `${feed.name} coverage`,
    labels: {
      reliability: reliabilityBucket(reliabilityScore),
      region: source?.region ?? feed.region ?? "Global",
      paywall: source?.tags?.includes("paywall") ? "Yes" : "No",
      bias_label: source?.bias_label ?? feed.bias_label ?? "Center",
    },
    feed_name: feed.name,
  };
}

async function fetchXml(feed) {
  if (USE_MOCK_RSS) {
    const fileName = feed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return readFile(new URL(`${MOCK_FEEDS_DIR}/${fileName}.xml`, import.meta.url), "utf8");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BriefBoard-MVP2/1.0 (+https://github.com)",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function dedupe(items) {
  const urlMap = new Map(items.map((item) => [item.url, item]));
  return [...urlMap.values()];
}

function clusterItems(items) {
  const clusters = [];
  for (const item of items) {
    const found = clusters.find((cluster) => {
      const withinDay = Math.abs(new Date(cluster.updated_at).getTime() - new Date(item.timestamp).getTime()) <= 24 * 3_600_000;
      const similarity = overlapScore(cluster.keywords, item.keywords);
      return withinDay && (similarity >= 0.45 || cluster.normalized_title === item.normalized_title);
    });

    if (found) {
      found.articles.push(item);
      found.keywords = [...new Set([...found.keywords, ...item.keywords])];
      if (new Date(item.timestamp) > new Date(found.updated_at)) found.updated_at = item.timestamp;
    } else {
      clusters.push({
        normalized_title: item.normalized_title,
        title: item.title,
        updated_at: item.timestamp,
        keywords: item.keywords,
        articles: [item],
      });
    }
  }

  return clusters;
}

function toCoverageBreadth(count) {
  if (count >= 6) return "Broad";
  if (count >= 3) return "Medium";
  return "Narrow";
}

function toTodayJson(items) {
  const clustered = clusterItems(dedupe(items));
  const ranked = clustered
    .map((cluster) => {
      const uniqueOutlets = new Set(cluster.articles.map((a) => a.source_domain)).size;
      const recency = Math.max(0, 72 - (Date.now() - new Date(cluster.updated_at).getTime()) / 3_600_000);
      const rank = (recency / 72) * 0.7 + uniqueOutlets * 0.3;
      const best = [...cluster.articles].sort((a, b) => (b.labels.reliability > a.labels.reliability ? 1 : -1))[0];
      return {
        cluster_id: `cluster-${Math.random().toString(36).slice(2, 9)}`,
        rank_score: Number(rank.toFixed(3)),
        title: cluster.title,
        topic_tags: cluster.keywords.slice(0, 3),
        updated_at: cluster.updated_at,
        coverage_breadth: toCoverageBreadth(uniqueOutlets),
        best_article: {
          url: best.url,
          source_domain: best.source_domain,
          image_url: "",
          labels: best.labels,
          trace_summary: `Picked ${best.source_domain} based on reliability and recency among ${cluster.articles.length} related reports.`,
        },
        articles: cluster.articles.map((article) => ({
          url: article.url,
          title: article.title,
          source_domain: article.source_domain,
          timestamp: article.timestamp,
          snippet: article.snippet,
          labels: article.labels,
        })),
      };
    })
    .sort((a, b) => b.rank_score - a.rank_score || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() || a.title.localeCompare(b.title))
    .slice(0, MAX_STORIES)
    .map((cluster, index, arr) => ({
      ...cluster,
      priority: index < Math.ceil(arr.length * 0.3) ? "top" : index < Math.ceil(arr.length * 0.7) ? "scan" : "low",
    }));

  return {
    date: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    clusters: ranked,
  };
}

function validateToday(payload) {
  if (!payload?.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) throw new Error("Invalid date in today.json");
  if (!payload?.generated_at || Number.isNaN(Date.parse(payload.generated_at))) throw new Error("Invalid generated_at in today.json");
  if (!Array.isArray(payload.clusters)) throw new Error("clusters must be an array");
  payload.clusters.forEach((cluster, index) => {
    if (!cluster.cluster_id) throw new Error(`clusters[${index}].cluster_id missing`);
    if (!cluster.best_article?.url) throw new Error(`clusters[${index}].best_article.url missing`);
    if (!Array.isArray(cluster.articles)) throw new Error(`clusters[${index}].articles missing`);
  });
}

async function writeArchive(todayPayload) {
  const archiveDir = new URL(`../public/data/${todayPayload.date}/`, import.meta.url);
  await mkdir(archiveDir, { recursive: true });
  await writeFile(new URL("today.json", archiveDir), `${JSON.stringify(todayPayload, null, 2)}\n`, "utf8");

  let existingDates = [];
  try {
    const parsed = JSON.parse(await readFile(INDEX_OUTPUT_PATH, "utf8"));
    existingDates = Array.isArray(parsed.dates) ? parsed.dates : [];
  } catch {
    existingDates = [];
  }

  const dates = Array.from(new Set([todayPayload.date, ...existingDates])).sort((a, b) => (a < b ? 1 : -1));
  await writeFile(INDEX_OUTPUT_PATH, `${JSON.stringify({ dates }, null, 2)}\n`, "utf8");
}

async function main() {
  const feeds = JSON.parse(await readFile(FEEDS_PATH, "utf8"));
  const sources = JSON.parse(await readFile(SOURCES_PATH, "utf8"));
  const sourcesByDomain = new Map(sources.map((source) => [source.domain, source]));

  const allItems = [];
  const failures = [];

  for (const feed of feeds) {
    try {
      const xml = await fetchXml(feed);
      const parsedItems = parseItems(xml)
        .map((item) => parseRssItem(item, feed, sourcesByDomain))
        .filter(Boolean);
      allItems.push(...parsedItems);
      console.log(`Fetched ${parsedItems.length} items from ${feed.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${feed.name} (${feed.url}): ${message}`);
      console.warn(`Feed failed: ${feed.name} (${feed.url}) -> ${message}`);
    }
  }

  if (allItems.length === 0) {
    throw new Error(`All feeds failed. ${failures.join(" | ")}`);
  }

  const payload = toTodayJson(allItems);
  validateToday(payload);

  await mkdir(PUBLIC_DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(SOURCES_OUTPUT_PATH, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  await writeArchive(payload);

  console.log(`Fetched feeds: ${feeds.length - failures.length}/${feeds.length}`);
  console.log(`Items total: ${allItems.length}`);
  console.log(`Clusters generated: ${payload.clusters.length}`);
  if (failures.length > 0) console.warn(`Build continued with partial failures: ${failures.join(" | ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
