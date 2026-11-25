/** The workflow asks GitHub for a run this often. GitHub does not promise to start one. */
export const REQUESTED_SCAN_INTERVAL_MS = 5 * 60 * 1000;

/** Past this age the dashboard should say the published scan is stale. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface ScanFreshness {
  ageMs: number | null;
  stale: boolean;
  ageLabel: string;
}

export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function scanFreshness(scannedAt: string | undefined | null, now = Date.now()): ScanFreshness {
  const parsed = scannedAt ? Date.parse(scannedAt) : Number.NaN;
  if (!scannedAt || Number.isNaN(parsed)) return { ageMs: null, stale: true, ageLabel: 'unknown' };
  const ageMs = Math.max(0, now - parsed);
  return { ageMs, stale: ageMs > STALE_AFTER_MS, ageLabel: formatAge(ageMs) };
}
