import type { CouponOffer, GlitchDeal } from '../types/deals.ts';
import { formatPT } from './time.ts';

export type { CouponOffer };

const BLACK_FRIDAY_RE = /\b(?:black\s*friday|cyber\s*monday|doorbuster)\b/i;
const CODE_RE = /\b(?:with\s+code|w\/\s*|using\s+code|code|coupon)\s*[:\-]?\s*([A-Z0-9]{4,16})\b/gi;
const CODE_AFTER_RE = /\b([A-Z0-9]{4,16})\s+(?:code|coupon)\b/gi;
const DATE_RE = /\b(?:through|thru|until|expires|ends)\s+(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;
const NOT_A_CODE = new Set(['CODE', 'COUPON', 'PROMO', 'THROUGH', 'SHIPPING', 'WITH', 'FREE']);

export function isBlackFridayText(title: string): boolean {
  return BLACK_FRIDAY_RE.test(title);
}

export function normalizeDealTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, ' ')
    .replace(/\b\d{1,3}%\s*off\b/g, ' ')
    .replace(/\b(?:black friday|cyber monday|doorbuster)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function dealDedupeKey(deal: Pick<GlitchDeal, 'title' | 'retailer'>): string {
  return `${(deal.retailer || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}|${normalizeDealTitle(deal.title)}`;
}

export function dedupeByStoreAndTitle<T extends Pick<GlitchDeal, 'title' | 'retailer' | 'discountPercent'>>(items: T[]): T[] {
  const best = new Map<string, T>();
  for (const item of items) {
    const key = dealDedupeKey(item);
    const prev = best.get(key);
    if (!prev || (item.discountPercent || 0) > (prev.discountPercent || 0)) best.set(key, item);
  }
  return [...best.values()];
}

export function rankByRealDiscount<T extends Pick<GlitchDeal, 'discountPercent' | 'originalPrice' | 'glitchPrice' | 'detectedTimestamp'>>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const discount = (b.discountPercent || 0) - (a.discountPercent || 0);
    if (discount) return discount;
    const savings = (b.originalPrice - b.glitchPrice || 0) - (a.originalPrice - a.glitchPrice || 0);
    if (savings) return savings;
    return (b.detectedTimestamp || 0) - (a.detectedTimestamp || 0);
  });
}

export function selectBlackFridayDeals(deals: GlitchDeal[], sourceIds: string[], cap = 40): GlitchDeal[] {
  const wanted = new Set(sourceIds);
  const priced = deals.filter((deal) => (deal.discountPercent || 0) > 0 && (wanted.has(deal.sourceChannel) || isBlackFridayText(deal.title) || wanted.has((deal as GlitchDeal & { sourceId?: string }).sourceId || '')));
  return rankByRealDiscount(dedupeByStoreAndTitle(priced)).slice(0, cap);
}

/** Prefer source id stored on grounding or channel label. Engine passes sourceId via sourceChannel match separately. */
export function isBlackFridayDeal(deal: Pick<GlitchDeal, 'title' | 'sourceChannel'>, sourceId = ''): boolean {
  return sourceId === 'sd-black-friday' || /slickdeals black friday/i.test(deal.sourceChannel) || isBlackFridayText(deal.title);
}

function pacificDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function parseExpiry(text: string, nowMs: number): string | undefined {
  const match = text.match(DATE_RE);
  if (!match) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : Number(pacificDay(nowMs).slice(0, 4));
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isExpired(expiresAt: string | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  return expiresAt < pacificDay(nowMs);
}

function cleanCode(raw: string): string | undefined {
  const code = raw.toUpperCase();
  if (NOT_A_CODE.has(code) || code.length < 4) return undefined;
  if (!/[A-Z]/.test(code) || !/\d/.test(code) && code.length < 6) {
    if (!/\d/.test(code) && code.length < 6) return undefined;
  }
  return code;
}

export function findCouponCode(title: string): string | undefined {
  const codes: string[] = [];
  for (const re of [CODE_RE, CODE_AFTER_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(title)) !== null) {
      const code = cleanCode(match[1]);
      if (code) codes.push(code);
    }
  }
  return codes[0];
}

export function matchStore(title: string, stores: string[]): string | undefined {
  const hay = title.toLowerCase();
  const ordered = [...stores].sort((a, b) => b.length - a.length);
  return ordered.find((store) => hay.includes(store.toLowerCase()));
}

export function couponFromPost(input: {
  title: string;
  link: string;
  sourceLabel: string;
  seenMs: number;
  stores: string[];
  nowMs?: number;
}): CouponOffer | undefined {
  const nowMs = input.nowMs ?? Date.now();
  const code = findCouponCode(input.title);
  const store = matchStore(input.title, input.stores);
  if (!code || !store) return undefined;
  const expiresAt = parseExpiry(input.title, nowMs);
  if (isExpired(expiresAt, nowMs)) return undefined;
  return {
    id: `${store.toLowerCase()}|${code}`,
    store,
    code,
    offer: input.title,
    expiresAt,
    sourceUrl: input.link,
    sourceLabel: input.sourceLabel,
    seenAt: new Date(input.seenMs).toISOString(),
    seenAtPT: formatPT(input.seenMs),
  };
}

export function dedupeCoupons(coupons: CouponOffer[]): CouponOffer[] {
  const best = new Map<string, CouponOffer>();
  for (const coupon of coupons) {
    const prev = best.get(coupon.id);
    if (!prev || coupon.seenAt > prev.seenAt) best.set(coupon.id, coupon);
  }
  return [...best.values()].sort((a, b) => b.seenAt.localeCompare(a.seenAt));
}
