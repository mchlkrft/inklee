export const SITE_URL = "https://inklee.app";
export const SITE_NAME = "Inklee";

export function clampDescription(text: string, maxLength = 155): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export function buildTitle(
  title: string,
  suffix: string = SITE_NAME,
  maxLength = 60,
): string {
  const trimmed = title.trim();
  if (!suffix) return trimmed.slice(0, maxLength);
  const candidate = `${trimmed} · ${suffix}`;
  if (candidate.length <= maxLength) return candidate;
  return trimmed.slice(0, maxLength);
}

export function buildDescription(text: string, maxLength = 155): string {
  return clampDescription(text, maxLength);
}

export function absoluteUrl(path: string): string {
  if (!path || path === "/") return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
