import fs from 'fs/promises';
import path from 'path';
import { fingerprintDeal } from '../rules/watchRules.ts';
import type { DiscordStatus, SeenState, StoredAlert } from '../types/alerts.ts';
import type { GlitchDeal } from '../types/deals.ts';
import { assertNoSecrets, scrubSecrets } from './secrets.ts';
import { formatPT } from './time.ts';

export function resolveDataDir(cwd = process.cwd()): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(cwd, 'data');
}

export function isBaselineState(state: SeenState | null | undefined): boolean {
  if (!state || state.baselineComplete !== true) return true;
  return false;
}

export function emptySeen(): SeenState {
  return { baselineComplete: false, fingerprints: {} };
}

export async function loadSeen(dataDir: string): Promise<SeenState> {
  const file = path.join(dataDir, 'seen-alerts.json');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return emptySeen();
    throw err;
  }
  const trimmed = raw.trim();
  if (!trimmed) return emptySeen();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    throw new Error(`seen-alerts.json is not valid JSON (${err?.message || err}). Refusing to scan so existing state is not reset.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('seen-alerts.json must be a JSON object. Refusing to scan so existing state is not reset.');
  }
  const record = parsed as Partial<SeenState>;
  const fingerprints = record.fingerprints && typeof record.fingerprints === 'object' && !Array.isArray(record.fingerprints) ? record.fingerprints : {};
  return { baselineComplete: record.baselineComplete === true, fingerprints };
}

export async function loadHistory(dataDir: string): Promise<StoredAlert[]> {
  const file = path.join(dataDir, 'alerts-history.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw new Error(`alerts-history.json could not be read (${err?.message || err}).`);
  }
}

export function planAlerts(
  seen: SeenState,
  deals: GlitchDeal[],
  status: DiscordStatus,
  discordError?: string
): { seen: SeenState; fresh: GlitchDeal[]; alerts: StoredAlert[] } {
  const fingerprints = { ...seen.fingerprints };
  const fresh: GlitchDeal[] = [];
  for (const deal of deals) {
    const fp = fingerprintDeal({ id: deal.id, title: deal.title, retailer: deal.retailer, price: deal.glitchPrice });
    if (!fingerprints[fp]) {
      fingerprints[fp] = { firstSeenAt: new Date().toISOString(), dealId: deal.id };
      fresh.push(deal);
    }
  }
  const alerts = fresh.map((deal) => toStoredAlert(deal, status, discordError));
  return {
    seen: { baselineComplete: true, fingerprints },
    fresh,
    alerts,
  };
}

export function mergeHistory(existing: StoredAlert[], freshAlerts: StoredAlert[]): StoredAlert[] {
  // Newest first. planAlerts preserves scan order, so reverse to match "unshift each".
  return [...freshAlerts].reverse().concat(existing).slice(0, 50);
}

export function toStoredAlert(deal: GlitchDeal, discordStatus: DiscordStatus, discordError?: string): StoredAlert {
  const now = Date.now();
  const alert: StoredAlert = {
    id: deal.id,
    fingerprint: fingerprintDeal({ id: deal.id, title: deal.title, retailer: deal.retailer, price: deal.glitchPrice }),
    title: deal.title,
    retailer: deal.retailer,
    store: deal.retailer,
    sourceChannel: deal.sourceChannel,
    price: deal.glitchPrice,
    was: deal.originalPrice || 0,
    discountPercent: deal.discountPercent || 0,
    condition: deal.condition || 'Unverified condition',
    rules: deal.matchedRules || [],
    ruleLabels: (deal.matchedRules || []).map((rule) => rule.label),
    isPossiblePriceError: Boolean(deal.isPossiblePriceError),
    directBuyUrl: deal.directBuyUrl,
    sourceUrl: deal.sourceUrl,
    triggeredAt: new Date(now).toISOString(),
    triggeredAtPT: formatPT(now),
    discordStatus,
  };
  if (discordError) alert.discordError = discordError;
  return alert;
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  const scrubbed = scrubSecrets(data);
  assertNoSecrets(scrubbed);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(scrubbed, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}
