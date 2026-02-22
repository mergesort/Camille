/**
 * Shared URL helpers for link processing.
 */

/**
 * Return true when the URL is just a host with no meaningful path/query/hash.
 * This treats protocol/no-protocol variants the same (e.g. hello.app, https://hello.app).
 */
export function isBareDomainUrl(url: string): boolean {
  let candidate = url.trim();

  if (!candidate) {
    return false;
  }

  // Strip Slack formatting if present: <url|label>
  if (candidate.startsWith('<') && candidate.endsWith('>')) {
    candidate = candidate.slice(1, -1).trim();
  }

  if (candidate.includes('|')) {
    candidate = candidate.split('|')[0].trim();
  }

  try {
    const parsableUrl = /^(https?:\/\/)/i.test(candidate) ? candidate : `https://${candidate}`;
    const parsedUrl = new URL(parsableUrl);
    const hasDomainLikeHost = parsedUrl.hostname.includes('.');
    const hasOnlyRootPath = parsedUrl.pathname === '' || /^\/+$/u.test(parsedUrl.pathname);

    return hasDomainLikeHost && hasOnlyRootPath && !parsedUrl.search && !parsedUrl.hash;
  } catch {
    return false;
  }
}
