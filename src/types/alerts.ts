import type { RuleMatch } from './deals.ts';

export type DiscordStatus = 'sent' | 'no-webhook' | 'error' | 'skipped-baseline';

export type DiscordDelivery = DiscordStatus | 'none';

export interface SeenFingerprint {
  firstSeenAt: string;
  dealId?: string;
}

export interface SeenState {
  baselineComplete: boolean;
  fingerprints: Record<string, SeenFingerprint>;
}

export interface StoredAlert {
  id: string;
  fingerprint: string;
  title: string;
  retailer: string;
  store: string;
  sourceChannel: string;
  price: number;
  was: number;
  discountPercent: number;
  condition: string;
  rules: RuleMatch[];
  ruleLabels: string[];
  isPossiblePriceError: boolean;
  directBuyUrl: string;
  sourceUrl: string;
  triggeredAt: string;
  triggeredAtPT: string;
  discordStatus: DiscordStatus;
  discordError?: string;
}

export interface RejectionRow {
  title: string;
  source: string;
  reason: string;
}

export interface RejectionsFile {
  count: number;
  scannedAt: string;
  scannedAtPT: string;
  rejections: RejectionRow[];
}
