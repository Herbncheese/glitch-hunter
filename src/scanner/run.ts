import path from 'path';
import type { DiscordDelivery, DiscordStatus, RejectionsFile } from '../types/alerts.ts';
import type { ScanResponse, SourceStatus } from '../types/deals.ts';
import { buildDiscordMessage, postDiscord, webhookEnvState } from './discord.ts';
import { runFeedScan } from './engine.ts';
import { discordWebhookEnv, safeDiscordError } from './secrets.ts';
import { isBaselineState, loadHistory, loadSeen, mergeHistory, planAlerts, resolveDataDir, writeJson } from './state.ts';
import { formatPT } from './time.ts';

const REJECTION_CAP = 300;

export interface ScanRunSummary {
  dataDir: string;
  baseline: boolean;
  matchCount: number;
  newMatchCount: number;
  discordDelivery: DiscordDelivery;
  discordConfigured: boolean;
  scannedAt: string;
  scannedAtPT: string;
}

function withPacific(status: SourceStatus): SourceStatus {
  const ms = Date.parse(status.checkedAt);
  return Number.isNaN(ms) ? status : { ...status, checkedAtPT: formatPT(ms) };
}

function reasonCounts(rows: { reason: string }[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.reason, (counts.get(row.reason) || 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function sourceHealth(statuses: SourceStatus[]): Record<string, number> {
  const health: Record<string, number> = {};
  for (const status of statuses) health[status.state] = (health[status.state] || 0) + 1;
  return health;
}

export async function runScanAndPersist(): Promise<ScanRunSummary> {
  const dataDir = resolveDataDir();
  const seen = await loadSeen(dataDir);
  const baseline = isBaselineState(seen);
  const history = await loadHistory(dataDir);
  const scan = await runFeedScan();
  const sourceStatus = scan.sourceStatus.map(withPacific);
  const pacificNow = formatPT();
  const envState = webhookEnvState();

  let statusForFresh: DiscordStatus;
  let discordDelivery: DiscordDelivery;
  let discordError: string | undefined;

  if (baseline) {
    statusForFresh = 'skipped-baseline';
    discordDelivery = 'skipped-baseline';
  } else if (envState === 'invalid') {
    statusForFresh = 'error';
    discordDelivery = 'error';
    discordError = 'DISCORD_WEBHOOK_URL is not a valid Discord webhook URL';
  } else if (envState === 'missing') {
    statusForFresh = 'no-webhook';
    discordDelivery = 'no-webhook';
  } else {
    statusForFresh = 'sent';
    discordDelivery = 'sent';
  }

  let planned = planAlerts(seen, scan.deals, statusForFresh, discordError);
  if (!baseline && planned.fresh.length === 0) {
    discordDelivery = 'none';
  } else if (!baseline && planned.fresh.length > 0 && statusForFresh === 'sent') {
    try {
      await postDiscord(discordWebhookEnv(), buildDiscordMessage(planned.fresh, pacificNow));
    } catch (err) {
      discordDelivery = 'error';
      discordError = safeDiscordError(err, discordWebhookEnv());
      planned = planAlerts(seen, scan.deals, 'error', discordError);
    }
  }
  const nextHistory = mergeHistory(history, planned.alerts);

  const rejectionsFile: RejectionsFile = {
    count: scan.rejectedCount,
    scannedAt: scan.scannedAt,
    scannedAtPT: scan.scannedAtPT,
    rejections: scan.rejections.slice(0, REJECTION_CAP).map((row) => ({
      title: row.title,
      source: row.source,
      reason: row.reason,
    })),
  };

  const latest: ScanResponse = {
    deals: scan.deals,
    groundingUrls: sourceStatus.filter((s) => s.state === 'ok' || s.state === 'cached').map((s) => ({ title: s.label, uri: s.url })),
    sourceStatus,
    xPosts: [],
    xSearchLinks: scan.xSearchLinks,
    xAccounts: scan.xAccounts,
    rejectedCount: scan.rejectedCount,
    rejectionReasonCounts: reasonCounts(scan.rejections),
    scanSummary: scan.scanSummary,
    scannedAt: scan.scannedAt,
    scannedAtPT: scan.scannedAtPT,
    queryExecuted: scan.queryExecuted,
    newMatchCount: planned.fresh.length,
    baselineComplete: planned.seen.baselineComplete,
    discordConfigured: webhookEnvState() === 'ok',
    discordDelivery,
    sourceHealth: sourceHealth(sourceStatus),
  };

  await writeJson(path.join(dataDir, 'alerts-history.json'), nextHistory);
  await writeJson(path.join(dataDir, 'rejections.json'), rejectionsFile);
  await writeJson(path.join(dataDir, 'latest-scan.json'), latest);
  await writeJson(path.join(dataDir, 'seen-alerts.json'), planned.seen);

  const health = latest.sourceHealth || {};
  const healthText = Object.entries(health)
    .map(([state, count]) => `${count} ${state}`)
    .join(', ');
  console.log(`GlitchHunter scan ${scan.scannedAtPT}`);
  console.log(`  data: ${dataDir}`);
  console.log(`  baseline: ${baseline ? 'yes (recorded matches, Discord not notified)' : 'no'}`);
  console.log(`  matches: ${scan.deals.length}`);
  console.log(`  new: ${planned.fresh.length}`);
  console.log(`  discord: ${discordDelivery}${discordError ? ` (${discordError})` : ''}`);
  console.log(`  webhook configured: ${latest.discordConfigured ? 'yes' : 'no'}`);
  console.log(`  sources: ${healthText || 'none'}`);
  for (const source of sourceStatus) {
    const detail = source.message ? ` — ${source.message}` : '';
    console.log(`  - ${source.id}: ${source.state} (${source.itemsFetched} in, ${source.dealsKept} kept)${detail}`);
  }

  return {
    dataDir,
    baseline,
    matchCount: scan.deals.length,
    newMatchCount: planned.fresh.length,
    discordDelivery,
    discordConfigured: Boolean(latest.discordConfigured),
    scannedAt: scan.scannedAt,
    scannedAtPT: scan.scannedAtPT,
  };
}
