// Shared types for the headless scanner (latest-scan.json) and the static React UI.
// Every number here is parsed from a real fetched feed item. Nothing is estimated or randomized.

export type WatchRuleId =
  | 'tech-clearance'
  | 'cyber-laptop'
  | 'mac-mini'
  | 'kids'
  | 'local-ai'
  | 'christmas-2026';

export type DealCategory =
  | 'all'
  | 'price-errors'
  | 'tech-clearance'
  | 'cyber-laptop'
  | 'mac-mini'
  | 'kids'
  | 'local-ai'
  | 'christmas-2026'
  | 'tvs-monitors'
  | 'laptops-pcs'
  | 'pc-parts'
  | 'other-tech';

export interface RuleMatch {
  ruleId: WatchRuleId;
  label: string;
  reason: string;
}

export type GlitchType =
  | 'Possible Price Error' // >=70% off a believable usual price >= $100, or source explicitly says price error/glitch
  | 'Big Markdown' // 40-69% off a clearly marked was/list price
  | 'Markdown' // < 40% off a clearly marked was/list price
  | 'Deal (single price)'; // only one price posted; no reliable "was" price

// Source ids are plain strings so new feeds can be added in server.ts without touching the UI.
export type SourcePlatform = string;

export type PriceBasis =
  | 'none'
  | 'equation' // "$599 - $150 = $449"
  | 'labeled-was' // was / reg / list / MSRP / orig / compare at
  | 'from-to' // "from $599 to $449", "$599 -> $449", "down from $599"
  | 'strikethrough' // <del>/<s>/~~$599~~
  | 'dollars-off' // "$449 ($150 off)"
  | 'percent-off' // "$449 (25% off)"
  | 'retailer-list-price'; // Woot list price field

export interface GroundingCitation {
  title: string;
  uri: string;
}

export interface CheckPriceLink {
  label: string;
  uri: string;
}

export interface GlitchDeal {
  id: string;
  title: string;
  skuOrAsin: string;
  category: Exclude<DealCategory, 'all' | 'price-errors'>;
  glitchType: GlitchType;
  isPossiblePriceError: boolean;
  priceErrorReason?: string;
  originalPrice: number; // 0 when unknown
  glitchPrice: number;
  discountPercent: number; // 0 when unknown
  priceBasis: PriceBasis;
  isVerifiedSinglePrice?: boolean; // true = only one price known (kept for UI compatibility)
  condition?: 'New' | 'Refurbished' | 'Open-Box' | 'Used' | 'Unverified condition';
  isNewBotFind?: boolean;
  upvoteScore?: number;
  substanceScore?: number;
  matchedWatchlistKeywords?: string[];
  matchedRules?: RuleMatch[];
  hotCategory?: 'tvs-monitors' | 'laptops-pcs' | 'tablets' | 'phones' | 'consoles' | 'gpus-ssds' | 'audio' | 'wearables' | 'kids';
  hotScore?: number;
  seenAtPT?: string;
  retailer: string;
  sourceChannel: SourcePlatform;
  sourceUrl: string; // discussion / article link on the source site
  timeDetected: string; // kept for compatibility; UI recomputes from detectedTimestamp
  detectedTimestamp: number; // the post's publish time (ms)
  directBuyUrl: string;
  couponCode?: string;
  stackInstructions?: string;
  specsSummary: string;
  checkPriceLinks: CheckPriceLink[];
  groundingSources?: GroundingCitation[];
  isLiveGrounded?: boolean;
}

export type SourceState = 'ok' | 'empty' | 'error' | 'blocked' | 'rate-limited' | 'not-configured' | 'cached';

export interface SourceStatus {
  id: string;
  label: string;
  url: string;
  state: SourceState;
  httpStatus?: number;
  message?: string;
  itemsFetched: number;
  dealsKept: number;
  checkedAt: string; // ISO
  checkedAtPT?: string;
}

export interface XGlitchPost {
  id: string;
  text: string;
  author: string;
  url: string;
  createdAt: string;
  likes?: number;
  reposts?: number;
}

export interface XSearchLink {
  label: string;
  uri: string;
}

export interface ScanResponse {
  deals: GlitchDeal[];
  hotDeals?: GlitchDeal[];
  groundingUrls: GroundingCitation[];
  sourceStatus: SourceStatus[];
  xPosts: XGlitchPost[];
  xSearchLinks: XSearchLink[];
  rejectedCount: number;
  scanSummary: string;
  scannedAt: string; // ISO
  queryExecuted: string;
  scannedAtPT?: string;
  newMatchCount?: number;
  baselineComplete?: boolean;
  discordConfigured?: boolean;
  discordDelivery?: 'sent' | 'no-webhook' | 'error' | 'skipped-baseline' | 'none';
  sourceHealth?: Record<string, number>;
  rejectionReasonCounts?: { reason: string; count: number }[];
  xAccounts?: { label: string; uri: string }[];
}
