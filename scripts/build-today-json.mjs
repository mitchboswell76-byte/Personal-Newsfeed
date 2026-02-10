import { readFile, writeFile } from "node:fs/promises";

const FEEDS_PATH = new URL("../config/rss-feeds.json", import.meta.url);
const OUTPUT_PATH = new URL("../public/data/today.json", import.meta.url);
const MAX_STORIES = Number(process.env.MAX_STORIES ?? "40");
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

function scoreToPriority(index, total) {
  if (total === 0) return "low";
  const ratio = (index + 1) / total;
  if (ratio <= 0.34) return "top";
  if (ratio <= 0.7) return "scan";
  return "low";
}

function parseItems(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  if (items?.length) return items;
  return xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
}

function parseRssItem(rawItem, feed) {
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
  const publishedAt =
    firstMatch(rawItem, [
      /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
      /<published[^>]*>([\s\S]*?)<\/published>/i,
      /<updated[^>]*>([\s\S]*?)<\/updated>/i,
    ]) || new Date().toISOString();

  if (!url || !title) return null;

  const cleanedUrl = canonicalUrl(url);
  let sourceDomain = "unknown";
  try {
    sourceDomain = new URL(cleanedUrl).hostname.replace(/^www\./, "");
  } catch {
    sourceDomain = "unknown";
  }

  return {
    url: cleanedUrl,
    title,
    source_domain: sourceDomain,
    timestamp: new Date(publishedAt).toISOString(),
    snippet: snippet || `${feed.name} coverage`,
    labels: {
      reliability: feed.reliability,
      region: feed.region,
      paywall: "No",
      bias_label: feed.bias_label,
    },
    feedName: feed.name,
  };
}

async function fetchFromNetwork(feed) {
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": "BriefBoard-MVP1/1.0 (+https://github.com)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`${feed.name} failed (${response.status})`);
  return response.text();
}

async function fetchFromMock(feed) {
  const fileName = feed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = new URL(`../scripts/mock-feeds/${fileName}.xml`, import.meta.url);
  return readFile(path, "utf8");
}

async function fetchFeed(feed) {
  const xml = USE_MOCK_RSS ? await fetchFromMock(feed) : await fetchFromNetwork(feed);
  return parseItems(xml)
    .map((item) => parseRssItem(item, feed))
    .filter(Boolean);
}

function toTodayJson(items) {
  const deduped = Array.from(new Map(items.map((item) => [item.url, item])).values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_STORIES);

  const total = deduped.length;

  return {
    date: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    clusters: deduped.map((item, index) => ({
      cluster_id: `rss-${index + 1}`,
      rank_score: Number((1 - index / Math.max(total, 1)).toFixed(3)),
      priority: scoreToPriority(index, total),
      title: item.title,
      topic_tags: ["general"],
      updated_at: "just now",
      coverage_breadth: "Narrow",
      best_article: {
        url: item.url,
        source_domain: item.source_domain,
        image_url: "",
        labels: {
          reliability: item.labels.reliability,
          paywall: "No",
          bias_label: item.labels.bias_label,
        },
        trace_summary: `Picked from ${item.feedName} because it is the highest-ranked available article in this single-item cluster.`,
      },
      articles: [
        {
          url: item.url,
          title: item.title,
          source_domain: item.source_domain,
          timestamp: item.timestamp,
          snippet: item.snippet,
          labels: item.labels,
        },
      ],
    })),
  };
}

async function buildTodayJson() {
  const feeds = JSON.parse(await readFile(FEEDS_PATH, "utf8"));
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)));
  const items = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
  const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason?.message ?? String(r.reason));
  return { items, failures };
}

async function main() {
  let { items, failures } = await buildTodayJson();

  if (items.length === 0 && !USE_MOCK_RSS) {
    console.warn("Live RSS fetch failed for all feeds. Retrying with local mock feeds for development.");
    process.env.USE_MOCK_RSS = "1";
    ({ items, failures } = await (async () => {
      const feeds = JSON.parse(await readFile(FEEDS_PATH, "utf8"));
      const mockResults = await Promise.allSettled(
        feeds.map(async (feed) => {
          const xml = await fetchFromMock(feed);
          return parseItems(xml)
            .map((item) => parseRssItem(item, feed))
            .filter(Boolean);
        }),
      );
      return {
        items: mockResults.filter((r) => r.status === "fulfilled").flatMap((r) => r.value),
        failures: mockResults.filter((r) => r.status === "rejected").map((r) => r.reason?.message ?? String(r.reason)),
      };
    })());
  }

  if (items.length === 0) {
    throw new Error(`No feed items fetched. Failures: ${failures.join(" | ")}`);
  }

  const payload = toTodayJson(items);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${payload.clusters.length} clusters to public/data/today.json`);

  if (failures.length) {
    console.warn(`Some feeds failed but build continued: ${failures.join(" | ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
