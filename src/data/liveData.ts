import type { RejectionsFile, StoredAlert } from '../types/alerts';
import type { ScanResponse } from '../types/deals';

const REPO = import.meta.env.VITE_DATA_REPO || 'Herbncheese/glitch-hunter';
const BRANCH = import.meta.env.VITE_DATA_BRANCH || 'scanner-data';

export type DataOrigin = 'live' | 'bundled';

export interface LoadedJson<T> {
  data: T;
  origin: DataOrigin;
  url: string;
}

export function liveDataUrl(name: string, bust = Date.now()): string {
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/${name}?t=${bust}`;
}

export function bundledDataUrl(name: string, bust = Date.now()): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}data/${name}?t=${bust}`;
}

export async function fetchJsonWithFallback<T>(name: string): Promise<LoadedJson<T>> {
  const bust = Date.now();
  const liveUrl = liveDataUrl(name, bust);
  try {
    const live = await fetch(liveUrl, { cache: 'no-store' });
    if (live.ok) {
      return { data: (await live.json()) as T, origin: 'live', url: liveUrl };
    }
  } catch {
    // Live GitHub JSON is optional. Bundled dist/data is the fallback.
  }
  const localUrl = bundledDataUrl(name, bust);
  const bundled = await fetch(localUrl, { cache: 'no-store' });
  if (!bundled.ok) {
    throw new Error(`Could not load ${name} from GitHub (${BRANCH}) or the bundled data/${name} fallback.`);
  }
  return { data: (await bundled.json()) as T, origin: 'bundled', url: localUrl };
}

export interface DashboardData {
  scan: ScanResponse;
  history: StoredAlert[];
  rejections: RejectionsFile;
  origin: DataOrigin;
}

export async function loadDashboard(): Promise<DashboardData> {
  const [scan, history, rejections] = await Promise.all([
    fetchJsonWithFallback<ScanResponse>('latest-scan.json'),
    fetchJsonWithFallback<StoredAlert[]>('alerts-history.json'),
    fetchJsonWithFallback<RejectionsFile>('rejections.json'),
  ]);
  return {
    scan: scan.data,
    history: Array.isArray(history.data) ? history.data : [],
    rejections: rejections.data && Array.isArray(rejections.data.rejections) ? rejections.data : { count: 0, scannedAt: '', scannedAtPT: '', rejections: [] },
    origin: scan.origin,
  };
}

export const GITHUB_REPO = REPO;

export function actionsWorkflowUrl(): string {
  return `https://github.com/${REPO}/actions/workflows/scan.yml`;
}

export function actionsSecretsUrl(): string {
  return `https://github.com/${REPO}/settings/secrets/actions`;
}
