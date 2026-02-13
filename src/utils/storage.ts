export const STORAGE_KEYS = {
  read: "pnf.readIds",
  bookmarks: "pnf.bookmarkedIds",
  activeTab: "pnf.activeTab",
  detailTab: "pnf.detailTab",
  detailStory: "pnf.detailStoryId",
  settings: "pnf.settings.v2",
  archiveDate: "pnf.archiveDate",
};

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
