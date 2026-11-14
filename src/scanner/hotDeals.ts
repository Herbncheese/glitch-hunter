import { hasThirdPartyViaAmazon, isKidsItem, isLegitRetailer } from '../rules/watchRules.ts';
import type { GlitchDeal } from '../types/deals.ts';
import { formatPT } from './time.ts';

export type HotCategory =
  | 'tvs-monitors'
  | 'laptops-pcs'
  | 'tablets'
  | 'phones'
  | 'consoles'
  | 'gpus-ssds'
  | 'audio'
  | 'wearables'
  | 'kids';

export const HOT_CATEGORY_LABELS: Record<HotCategory, string> = {
  'tvs-monitors': 'TVs & Monitors',
  'laptops-pcs': 'Laptops & PCs',
  tablets: 'Tablets',
  phones: 'Phones',
  consoles: 'Consoles',
  'gpus-ssds': 'GPUs & SSDs',
  audio: 'Audio',
  wearables: 'Watches',
  kids: 'Kids',
};

const HOT_CAP = 60;
const MIN_PRICE = 15;
const CHEAP_ACCESSORY_PRICE = 25;

const CHEAP_ACCESSORY_RE =
  /\b(?:accessor(?:y|ies)|bundle kit|carrying case|charging dock|joy-?con|thumb grip|steering wheel|travel case|facial interface|head ?strap|link cable|screen protector|tempered glass|phone case|tablet case)\b/i;

const EXTRA_HOT_STORE_RE = /\bbj'?s(?:\s+wholesale)?\b/i;

const TABLET_RE = /\b(?:ipad|galaxy tab|fire tablet|fire hd|kindle fire|\btablet\b)\b/i;
const PHONE_RE = /\b(?:iphone|smartphone|galaxy\s?(?:s|z|a)\d*|pixel\s?\d|phone)\b/i;
const CONSOLE_RE = /\b(?:nintendo\s+switch|switch\s*(?:2|lite|oled)|playstation|ps5|xbox|steam deck|rog ally|legion go|meta quest|quest\s*[23])\b/i;
const LAPTOP_RE =
  /\b(?:laptop|laptops|notebook|macbook|chromebook|thinkpad|ideapad|loq|galaxy book|legion|omen|victus|alienware|xps|inspiron|nitro v)\b/i;
const DESKTOP_RE = /\b(?:desktop|prebuilt|gaming pc|mini pc|mac mini|mac studio|imac|nuc)\b/i;
const TV_MON_RE = /\b(?:\btvs?\b|television|oled|qled|qned|monitor|ultrawide)\b/i;
const GPU_RE = /\b(?:gpu|graphics card|geforce|radeon|rtx\s?\d{4}|rx\s?\d{4})\b/i;
const SSD_RE = /\b(?:\bssd\b|nvme)\b/i;
const AUDIO_RE = /\b(?:headphones?|earbuds|airpods|soundbar|speaker)\b/i;
const WATCH_RE = /\b(?:smart\s?watch|apple watch|garmin|galaxy watch)\b/i;

const STREAMING_STICK_RE = /\b(?:fire tv stick|fire tv cube|roku (?:stick|ultra|express|streaming)|chromecast|streaming stick)\b/i;
const PC_PERIPHERAL_RE = /\b(?:mechanical keyboard|gaming keyboard|gaming mouse)\b/i;

export function hotCategoryOf(title: string, text = ''): HotCategory | null {
  const hay = `${title} ${text}`;
  if (STREAMING_STICK_RE.test(title)) return null;
  if (isKidsItem(title) && !LAPTOP_RE.test(title) && !DESKTOP_RE.test(title) && !PC_PERIPHERAL_RE.test(title)) return 'kids';
  if (LAPTOP_RE.test(hay) || DESKTOP_RE.test(hay)) return 'laptops-pcs';
  if (TABLET_RE.test(hay)) return 'tablets';
  if (PHONE_RE.test(hay) && !TABLET_RE.test(hay)) return 'phones';
  if (CONSOLE_RE.test(hay)) return 'consoles';
  if (TV_MON_RE.test(hay)) return 'tvs-monitors';
  if (GPU_RE.test(hay) && !LAPTOP_RE.test(hay) && !DESKTOP_RE.test(hay)) return 'gpus-ssds';
  if (SSD_RE.test(title) && !LAPTOP_RE.test(hay) && !DESKTOP_RE.test(hay)) return 'gpus-ssds';
  if (AUDIO_RE.test(hay)) return 'audio';
  if (WATCH_RE.test(hay)) return 'wearables';
  return null;
}

function isHotStore(deal: GlitchDeal, text: string): boolean {
  const hay = `${deal.title} ${text} ${deal.retailer}`;
  if (hasThirdPartyViaAmazon(hay)) return false;
  if (isLegitRetailer(deal.retailer, deal.title, text)) return true;
  return EXTRA_HOT_STORE_RE.test(deal.retailer) || EXTRA_HOT_STORE_RE.test(deal.title);
}

/** Looser than the watch rules. Returns null when the post is junk or off-category. */
export function classifyHotDeal(deal: GlitchDeal, text = '', now = Date.now()): GlitchDeal | null {
  const price = Number(deal.glitchPrice) || 0;
  if (price < MIN_PRICE) return null;
  if (CHEAP_ACCESSORY_RE.test(deal.title) && price < CHEAP_ACCESSORY_PRICE) return null;
  if (!isHotStore(deal, text)) return null;
  const hotCategory = hotCategoryOf(deal.title, text);
  if (!hotCategory) return null;

  const ageHours = Math.max(0, (now - (deal.detectedTimestamp || now)) / 3_600_000);
  const frontpage = /slickdeals frontpage|slickdeals popular/i.test(deal.sourceChannel || '') ? 35 : 0;
  const discount = deal.discountPercent > 0 ? deal.discountPercent : 0;
  const upvotes = Math.min(40, Math.max(0, deal.upvoteScore || 0));
  const recency = Math.max(0, 36 - ageHours);
  const priceBoost = price >= 100 ? 18 : price >= 50 ? 8 : 0;
  const hotScore = discount * 1.5 + frontpage + upvotes + recency + priceBoost + (deal.isPossiblePriceError ? 25 : 0);

  return {
    ...deal,
    hotCategory,
    hotScore: Math.round(hotScore),
    seenAtPT: formatPT(deal.detectedTimestamp || now),
  };
}

export function rankHotDeals(deals: GlitchDeal[]): GlitchDeal[] {
  return [...deals].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0) || b.detectedTimestamp - a.detectedTimestamp).slice(0, HOT_CAP);
}

/** Discord and seen-alerts use strict watch-rule matches only. */
export function dealsForDiscord(strictDeals: GlitchDeal[]): GlitchDeal[] {
  return strictDeals.filter((deal) => (deal.matchedRules || []).length > 0);
}
