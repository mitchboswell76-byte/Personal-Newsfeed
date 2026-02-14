export type Priority = "top" | "scan" | "low";
export type TabKey = "brief" | "sources" | "archive" | "settings";
export type StoryDetailTab = "coverage" | "why" | "assessment";
export type PaywallMode = "allow" | "downrank" | "hide";
export type SourceWeight = "hide" | "normal" | "boost";
export type ThemeMode = "light" | "dark" | "system";

export type Labels = {
  reliability: "High" | "Med" | "Low";
  paywall: "Yes" | "No";
  bias_label?: string;
  region?: string;
};

export type Article = {
  url: string;
  title: string;
  source_domain: string;
  timestamp: string;
  snippet: string;
  labels: Labels;
};

export type BestArticle = {
  url: string;
  source_domain: string;
  image_url?: string;
  labels: Labels;
  trace_summary: string;
};

export type Cluster = {
  cluster_id: string;
  rank_score: number;
  priority: Priority;
  title: string;
  topic_tags: string[];
  updated_at: string;
  coverage_breadth: "Narrow" | "Medium" | "Broad";
  best_article: BestArticle;
  articles: Article[];
};

export type DerivedCluster = Cluster & {
  alternatives?: Array<{ article: Article; reason: string }>;
};

export type Today = {
  date: string;
  generated_at: string;
  clusters: Cluster[];
};

export type SourceMeta = {
  domain: string;
  reliability_score: number;
  region: string;
  tags: string[];
  bias_label?: string;
  user_weight?: SourceWeight;
  max_links_per_day?: number;
};

export type ArchiveIndex = { dates: string[] };

export type Assessment = {
  what_happened: string[];
  why_it_matters: string[];
  what_to_watch: { decision_point: string; deadline: string };
  stakeholders: string[];
  open_questions: string[];
  timeline?: Array<{ at: string; event: string }>;
  source_links?: string[];
};

export type FeedSettings = {
  storiesPerDay: number;
  topCount: number;
  scanCount: number;
  minReliability: Labels["reliability"];
  paywallMode: PaywallMode;
  keywordMutes: string[];
  topicBoosts: string[];
  sourceWeights: Record<string, SourceWeight>;
  sourceCaps: Record<string, number>;
  regionWeights: Record<string, number>;
  theme: ThemeMode;
  fontSize: number;
  compactMode: boolean;
  defaultTab: TabKey;
  archiveRetentionDays: 30 | 60 | 90 | 180;
};
