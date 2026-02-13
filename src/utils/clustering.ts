export function relativeTime(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
}
