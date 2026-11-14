import type { CheckPriceLink, GlitchDeal, GlitchType, PriceBasis, SourceState, SourceStatus, XSearchLink } from '../types/deals.ts';
import type { XLink } from '../data/xLinks.ts';
import { X_DEAL_ACCOUNTS, X_SEARCH_LINKS } from '../data/xLinks.ts';
import { detectCondition, evaluateWatchRules, isKidsItem } from '../rules/watchRules.ts';
import { classifyHotDeal, rankHotDeals } from './hotDeals.ts';
import { formatPT } from './time.ts';

/**
 * One-shot free RSS/JSON feed scan.
 * No Express server, no Gemini, no paid APIs. Each source is isolated:
 * a timeout, 403, or parse error is recorded on that source and the scan continues.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 GlitchHunter/2.0';

const HOUR = 3600_000;
const GENERAL_MAX_AGE_MS = 72 * HOUR; // ignore normal deals older than 3 days
const GLITCH_MAX_AGE_MS = 7 * 24 * HOUR; // price-mistake searches: 7 days

interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

async function fetchText(url: string, accept = 'application/rss+xml, application/xml, text/xml, */*;q=0.8', timeoutMs = 9000, extraHeaders: Record<string, string> = {}): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', ...extraHeaders },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err: any) {
    return { ok: false, status: 0, text: '', error: err?.name === 'TimeoutError' ? 'timeout' : err?.message || 'network error' };
  }
}

function stateFromHttp(r: FetchResult): SourceState {
  if (r.ok) return 'ok';
  if (r.status === 429) return 'rate-limited';
  if (r.status === 401 || r.status === 403) return 'blocked';
  return 'error';
}

function httpMessage(r: FetchResult): string {
  if (r.ok) return '';
  if (r.status === 0) return `Network error: ${r.error}`;
  if (r.status === 429) return 'HTTP 429 - rate limited by the site';
  if (r.status === 403) return 'HTTP 403 - site blocked this server';
  return `HTTP ${r.status}`;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function stripHtml(str: string): string {
  return decodeHtmlEntities(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1] : '';
}

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;

function money(whole: string, cents?: string): number {
  const n = parseFloat(`${whole.replace(/,/g, '')}${cents ? `.${cents.padEnd(2, '0')}` : ''}`);
  return isNaN(n) ? 0 : n;
}

function allPrices(text: string): number[] {
  const out: number[] = [];
  const re = new RegExp(MONEY, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = money(m[1], m[2]);
    if (v > 0 && v < 50000) out.push(v);
  }
  return out;
}

const near = (a: number, b: number, tol = 0.03) => Math.abs(a - b) <= Math.max(1, b * tol);

// ---------------------------------------------------------------------------
// Raw items + feed parsing
// ---------------------------------------------------------------------------

export interface RawItem {
  title: string;
  text: string; // plain-text description
  html: string; // raw HTML description
  link: string; // best outbound/buy link
  sourceUrl: string; // discussion / article URL
  pubMs: number;
  sourceId: string;
  sourceLabel: string;
  retailerHint?: string;
  upvotes?: number;
  preSale?: number;
  preList?: number;
  isGlitchFeed?: boolean;
}

function parseRss(xml: string, sourceId: string, sourceLabel: string): RawItem[] {
  const items: RawItem[] = [];
  for (const block of xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []) {
    const title = stripHtml(extractTag(block, 'title'));
    let link = decodeHtmlEntities(extractTag(block, 'link')).trim();
    if (!link) {
      const guid = decodeHtmlEntities(extractTag(block, 'guid'));
      if (guid.startsWith('http')) link = guid;
    }
    const html = decodeHtmlEntities(`${extractTag(block, 'content:encoded')} ${extractTag(block, 'description')}`);
    const pubStr = decodeHtmlEntities(extractTag(block, 'pubDate') || extractTag(block, 'dc:date'));
    const pubMs = Date.parse(pubStr);
    if (!title || !link || isNaN(pubMs)) continue; // no invented timestamps
    const thumb = html.match(/Thumb Score:\s*([+-]?\d+)/i);
    const vendor = stripHtml(extractTag(block, 'vendorname'));
    const storeSlug = html.match(/data-store-slug="([^"]+)"/i);
    items.push({
      title,
      text: stripHtml(html),
      html,
      link,
      sourceUrl: link,
      pubMs,
      sourceId,
      sourceLabel,
      retailerHint: vendor || (storeSlug ? storeSlug[1] : undefined),
      upvotes: thumb ? parseInt(thumb[1], 10) : undefined,
    });
  }
  return items;
}

function parseRedditAtom(xml: string, sourceId: string): RawItem[] {
  const items: RawItem[] = [];
  for (const block of xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || []) {
    const title = stripHtml(extractTag(block, 'title'));
    const html = decodeHtmlEntities(extractTag(block, 'content'));
    const permalink = (block.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    const outbound = html.match(/<a href="([^"]+)">\[link\]<\/a>/i);
    const sub = (block.match(/<category[^>]+term="([^"]+)"/i) || [])[1] || '';
    const pubMs = Date.parse(stripHtml(extractTag(block, 'published') || extractTag(block, 'updated')));
    if (!title || !permalink || isNaN(pubMs)) continue;
    const outUrl = outbound ? decodeHtmlEntities(outbound[1]) : '';
    const isSelfPost = !outUrl || /reddit\.com|redd\.it|i\.redd\.it|imgur|youtu/.test(outUrl);
    items.push({
      title,
      text: stripHtml(html.replace(/submitted by[\s\S]*$/i, '')),
      html,
      link: isSelfPost ? decodeHtmlEntities(permalink) : outUrl,
      sourceUrl: decodeHtmlEntities(permalink),
      pubMs,
      sourceId,
      sourceLabel: sub ? `r/${sub}` : 'Reddit',
      isGlitchFeed: /pricemistakes|glitchdeals/i.test(sub),
    });
  }
  return items;
}

interface SourceDef {
  id: string;
  label: string;
  url: string; // human-facing URL shown in UI
  ttlMs: number;
  glitchFeed?: boolean;
  limit?: number;
  fetcher: () => Promise<{ result: FetchResult; items: RawItem[]; message?: string; state?: SourceState }>;
}

const sdSearch = (q: string) =>
  `https://slickdeals.net/newsearch.php?src=SearchBarV2&q=${encodeURIComponent(q)}&searcharea=deals&searchin=first&rss=1`;

function rssSource(id: string, label: string, feedUrl: string, opts: Partial<SourceDef> = {}): SourceDef {
  return {
    id,
    label,
    url: opts.url || feedUrl,
    ttlMs: 0,
    ...opts,
    fetcher: async () => {
      const result = await fetchText(feedUrl);
      const items = result.ok ? parseRss(result.text, id, label) : [];
      if (opts.glitchFeed) items.forEach((i) => (i.isGlitchFeed = true));
      return { result, items };
    },
  };
}

// Reddit: JSON endpoints return 403 to servers; Atom RSS works but rate-limits (429) quickly.
// So: one multireddit request + one r/Monitors deal search, sequential, cached 5 min, backoff on 429.
const REDDIT_DEAL_SUBS = 'buildapcsales+LaptopDeals+deals+PriceMistakes+glitchdeals';
async function fetchReddit(url: string, id: string) {
  const result = await fetchText(url, 'application/atom+xml, application/xml, */*;q=0.8');
  return { result, items: result.ok ? parseRedditAtom(result.text, id) : [] };
}

// Woot: no free public RSS any more. The public Discourse forum lists new offers; we read each offer page
// for the real sale price and Woot's own list price.
async function fetchWoot() {
  const searches = ['computers.woot.com', 'electronics.woot.com'];
  let firstResult: FetchResult | null = null;
  const offers: { title: string; url: string; created: number }[] = [];
  for (const domain of searches) {
    const r = await fetchText(`https://forums.woot.com/search.json?q=${encodeURIComponent(domain + ' order:latest')}`, 'application/json');
    if (!firstResult || !firstResult.ok) firstResult = r;
    if (!r.ok) continue;
    try {
      const data = JSON.parse(r.text);
      for (const t of (data?.topics || []).slice(0, 6)) {
        const created = Date.parse(t.created_at);
        if (!t.slug || isNaN(created)) continue;
        offers.push({ title: decodeHtmlEntities(t.title || ''), url: `https://${domain}/offers/${t.slug}`, created });
      }
    } catch {
      /* bad JSON - reported via status below */
    }
  }
  const items: RawItem[] = [];
  await Promise.all(
    offers.map(async (o) => {
      const page = await fetchText(o.url, 'text/html', 8000);
      if (!page.ok) return;
      const block = (page.text.match(/<div class="price-exact"[\s\S]{0,800}/i) || [])[0];
      if (!block) return;
      const sale = block.match(new RegExp(`class="price"[^>]*>\\s*${MONEY}`, 'i'));
      const list = block.match(new RegExp(`class="list-price"[^>]*>\\s*${MONEY}`, 'i'));
      const saleV = sale ? money(sale[1], sale[2]) : 0;
      if (!saleV) return;
      const soldOut = /sold out/i.test(page.text.slice(0, 200000).match(/<title>[\s\S]*?<\/title>/i)?.[0] || '');
      if (soldOut) return;
      items.push({
        title: o.title,
        text: '',
        html: block,
        link: o.url,
        sourceUrl: o.url,
        pubMs: o.created,
        sourceId: 'woot',
        sourceLabel: 'Woot',
        retailerHint: 'Woot',
        preSale: saleV,
        preList: list ? money(list[1], list[2]) : 0,
      });
    })
  );
  return { result: firstResult || { ok: false, status: 0, text: '', error: 'no request' }, items };
}


const SOURCES: SourceDef[] = [
  rssSource('sd-frontpage', 'Slickdeals Frontpage', 'https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1', { url: 'https://slickdeals.net/' }),
  rssSource('sd-popular', 'Slickdeals Popular', 'https://slickdeals.net/newsearch.php?mode=popdeals&searcharea=deals&searchin=first&rss=1', { url: 'https://slickdeals.net/deals/' }),
  rssSource('sd-price-mistake', 'Slickdeals "price mistake"', sdSearch('price mistake'), { glitchFeed: true }),
  rssSource('sd-price-error', 'Slickdeals "price error"', sdSearch('price error'), { glitchFeed: true }),
  rssSource('sd-glitch', 'Slickdeals "glitch"', sdSearch('glitch'), { glitchFeed: true }),
  rssSource('sd-tv', 'Slickdeals TV search', sdSearch('tv')),
  rssSource('sd-laptop', 'Slickdeals laptop search', sdSearch('laptop')),
  rssSource('sd-monitor', 'Slickdeals monitor search', sdSearch('monitor')),
  rssSource('sd-gpu', 'Slickdeals GPU search', sdSearch('rtx graphics card')),
  {
    id: 'reddit-deals',
    label: 'Reddit r/buildapcsales, r/LaptopDeals, r/deals, r/PriceMistakes, r/glitchdeals',
    url: `https://www.reddit.com/r/${REDDIT_DEAL_SUBS}/new/`,
    ttlMs: 0,
    fetcher: () => fetchReddit(`https://www.reddit.com/r/${REDDIT_DEAL_SUBS}/new/.rss?limit=100`, 'reddit-deals'),
  },
  {
    id: 'reddit-monitors',
    label: 'Reddit r/Monitors (new posts; discussion is filtered out)',
    url: 'https://www.reddit.com/r/Monitors/new/',
    ttlMs: 0,
    fetcher: () => fetchReddit('https://www.reddit.com/r/Monitors/new/.rss?limit=50', 'reddit-monitors'),
  },
  { id: 'woot', label: 'Woot (computers + electronics)', url: 'https://www.woot.com/category/computers', ttlMs: 0, fetcher: fetchWoot },
  rssSource('meh', 'Meh daily deal', 'https://meh.com/deals.rss', { url: 'https://meh.com/' }),
  rssSource('dealnews-electronics', 'DealNews Electronics', 'https://www.dealnews.com/c142/Electronics/?rss=1'),
  rssSource('dealnews-computers', 'DealNews Computers', 'https://www.dealnews.com/c39/Computers/?rss=1'),
  rssSource('9to5toys', '9to5Toys', 'https://9to5toys.com/feed/'),
  rssSource('techbargains', 'TechBargains', 'https://www.techbargains.com/rss.xml', { url: 'https://www.techbargains.com/' }),
  rssSource('bensbargains', "Ben's Bargains", 'https://bensbargains.com/rss.xml', { url: 'https://bensbargains.com/' }),
];


// ---------------------------------------------------------------------------
// Classification + pricing rules
// ---------------------------------------------------------------------------

const QUESTION_RE = /\?\s*$|^(?:which|what|should|is|are|any|anyone|does|do|can|how|why|help|thoughts|opinions?|need advice|wtb|looking for)\b|\b(?:better buy|worth it|should i|which one|good deal\?|vs\.?)\b/i;
const NEWS_RE = /\b(?:announces?|announced|announcement|officially reveals|reveals|leak(?:s|ed)?|rumou?rs?|preview|ad scan|weekly ad|megathread|(?:deal|daily|discussion|weekly|monthly) thread|discussion|predictions?|roundup|recap|reviews?|guide|explained|hands[- ]on|unboxing|psa|reminder|schedule)\b/i;
const ROUNDUP_RE = /\bup to\s+(?:\$\s?\d|\d+\s*%)|\b\d+\+?\s+deals\b|\bdeals\b(?!\s*(?:thread))|\bsale event\b|\bsitewide\b|\b(?:select|various|assorted)\s+(?:items|models|styles|games)\b|\band more\b|,\s*more\b/i;
const RANGE_RE = new RegExp(`${MONEY}\\s*(?:-|–|to)\\s*${MONEY}(?!\\s*=)`, 'i');
const SUBSCRIPTION_RE = /\b(?:subscription|membership(?! required)|per month|\/mo\b|\/month|\/yr\b|annual plan|game pass|lifetime (?:access|license|subscription)|license key|software license|vpn)\b/i;
const GIFT_CARD_RE = /\b(?:gift ?cards?|e-?gift|egift|gc)\b/i;
const REBATE_ONLY_RE = /\b(?:mail-?in rebate|rebate)\b/i;
const COUPON_ONLY_RE = new RegExp(`^(?:[^$]*?)${MONEY}\\s*off\\b`, 'i'); // title's first price is "$X off"
const MEDIA_RE = /\b(?:blu-?ray|steelbook|dvd|digital (?:code|copy)|@ steam|on steam|steam key|pc game|dlc|season pass|ebook|kindle edition|audiobook|vinyl|soundtrack)\b/i;
const NON_TECH_RE = /\b(?:tv stand|media console|entertainment center|furniture|grill|smoker|vacuum|air fryer|air purifier|hair|dryer|washer|refrigerator|mattress|toy|lego|socks|shirt|shoes|cookies|snack|coffee|dog food|cat food|lip balm|gloves|bucket|putty|lawn|mower|blower|cultivator|garage door|lock|blood pressure|baby monitor|e-?bike|scooter)\b/i;
/** Medical, baby, pet, air, water, tire, and power "monitors" are not display monitors. */
const MONITOR_NOISE_REGEX =
  /\b(?:glucose|glucometer|diabetic|lancet|blood pressure|heart rate|spo2|pulse ox|baby monitor|nanny|pet monitor|selfie monitor|breath|fetal|fetus|air quality|water monitor|tire pressure|tpms|power monitor|energy monitor|plant monitor)\b/i;
const ACCESSORY_RE = /\b(?:accessor(?:y|ies)|bundle kit|carrying case|charging dock|joy-?con|thumb grip|steering wheel|travel case|facial interface|head ?strap|link cable|case|cases|cover|pencil|screen protector|tempered glass|cable|cord|charger|charging|adapter|mount|stand|stylus|skin|sleeve|bag|backpack|strap|band|dock|hub|remote|grip|mouse ?pad|desk ?mat|power bank|portable charger|wall plate|cleaning|filter)\b/i;

const CAT_TV_MON = /\b(?:tv|tvs|television|oled|qled|qned|mini[- ]?led|monitor|monitors|ultrawide|projector|\d{2}["”]?\s*(?:in(?:ch)?)?\s*(?:4k|uhd|1440p|qhd)|bravia|odyssey g\d|ultragear)\b|\[monitor\]/i;
const CAT_LAPTOP_PC = /\b(?:laptop|laptops|notebook|macbook|chromebook|thinkpad|ideapad|loq|galaxy book\d*|lg gram|predator|helios|nitro v?|rog (?:strix|zephyrus|flow)|tuf gaming|aero x?\d*|vector|katana|cyborg|stealth|razer blade|pavilion|aspire|swift|probook|elitebook|yoga slim|zenbook|vivobook|zephyrus|legion|omen|victus|alienware|xps|inspiron|latitude|spectre|envy x360|surface (?:laptop|pro)|desktop|prebuilt|gaming pc|mini pc|mac mini|mac studio|imac|nuc|all-in-one pc)\b|\[(?:laptop|prebuilt|desktop)\]/i;
const CAT_PARTS = /\b(?:gpu|graphics card|video card|rtx\s?\d{4}|rx\s?\d{4}|radeon|geforce|arc b\d{3}|cpu|processor|ryzen \d|core i[3579]|core ultra|motherboard|ssd|nvme|m\.2|hdd|hard drive|ddr[45]|ram kit|memory kit|psu|power supply|cpu cooler|aio|pc case)\b|\[(?:gpu|cpu|ssd|hdd|ram|psu|motherboard|mobo|cooler|case|nvme|m\.2)\]/i;
const CAT_OTHER = /\b(?:headphones?|earbuds|airpods|soundbar|speaker|receiver|tablet|ipad|kindle|e-?reader|smartphone|iphone|galaxy (?:s|z|a|tab)\d*|pixel \d|smartwatch|apple watch|garmin|router|mesh wi-?fi|wi-?fi \d|nas|ps5|playstation|xbox|switch 2|nintendo switch|steam deck|rog ally|legion go|meta quest|vr headset|camera|mirrorless|gopro|drone|dji|keyboard|gaming mouse|webcam|microphone|apple tv 4k|fire tv|roku|chromecast|power station|3d printer|network switch|ups battery|smart display|echo show|nest hub)\b|\[(?:keyboard|mouse|headphones|headset|router|controller|other)\]/i;

function classify(text: string, flair: string, sourceLabel: string): GlitchDeal['category'] | null {
  // 1. Reddit flair like [GPU] / [Monitor] / [Prebuilt] is the most reliable signal
  if (flair) {
    if (/\[(?:monitor|tv)\]/i.test(flair)) return 'tvs-monitors';
    if (/\[(?:laptop|prebuilt|desktop)\]/i.test(flair)) return 'laptops-pcs';
    if (CAT_PARTS.test(flair)) return 'pc-parts';
  }
  if (/r\/LaptopDeals/i.test(sourceLabel) && /\b(?:laptop|notebook|gaming|oled|display|ryzen|intel|rtx)\b/i.test(text)) return 'laptops-pcs';
  if (/\b(?:fire tv stick|fire tv cube|streaming (?:stick|device|media player)|roku (?:stick|ultra|express|streaming)|chromecast|google tv streamer|apple tv 4k|tv box)\b/i.test(text)) return 'other-tech';
  // 2. Laptops/PCs first (their specs mention OLED displays, Ryzen CPUs, RTX GPUs), then TVs/monitors, then parts
  if (CAT_LAPTOP_PC.test(text)) return 'laptops-pcs';
  if (CAT_TV_MON.test(text)) return 'tvs-monitors';
  if (CAT_PARTS.test(text)) return 'pc-parts';
  if (CAT_OTHER.test(text)) return 'other-tech';
  return null;
}

const SAYS_ERROR_RE = /\b(?:price (?:error|mistake|glitch)|pricing (?:error|mistake|glitch)|price ?mistake|glitch(?:ed)?|mispriced|misprice)\b/i;

/** Remove price mentions that are never the product price (shipping thresholds, cashback, bonus gift cards...). */
function stripNoise(s: string): string {
  return s
    .replace(/\*+\s*\$/g, '$')
    .replace(/\${2,}/g, '$')
    .replace(/(?<![\$\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?\$(?!\s?\d)/g, (_m, w, c) => `$${w}${c ? '.' + c : ''}`)
    .replace(new RegExp(`${MONEY}\\s*(?:fee|shipping fee|s&h fee)\\b(?:\\s*per order)?`, 'gi'), ' ')
    .replace(new RegExp(`(?:w\\/\\s*prime\\s+or\\s+)?\\b(?:(?:on|over|w\\/|with)\\s*(?:orders?\\s*(?:of|over|above)?\\s*)?|for\\s+orders?\\s*(?:of|over|above)?\\s*)${MONEY}\\s*\\+?(?:\\s*orders?)?`, 'gi'), ' ')
    .replace(new RegExp(`\\borders?\\s*(?:of|over|above)\\s*${MONEY}\\s*\\+?`, 'gi'), ' ')
    .replace(new RegExp(`\\+?\\s*(?:free\\s+|bonus\\s+|get\\s+(?:a\\s+)?|earn\\s+|w\\/\\s*|with\\s+)?${MONEY}\\s*(?:[A-Za-z'’]+\\s+){0,2}(?:cash|cashback|cash back|rewards?|e-?gift cards?|gift cards?|gc|credit|store credit|promo credit|bonus)\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\(?\\bor\\s*${MONEY}\\s*(?:for|w\\/|with)\\s*new\\s*(?:\\S+\\s+){0,3}(?:customers?|members?|users?|accounts?)\\)?`, 'gi'), ' ')
    .replace(new RegExp(`\\+\\s*${MONEY}\\s*(?:shipping|s&h|delivery)`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:spend|min(?:imum)?)\\s*${MONEY}`, 'gi'), ' ');
}

interface PriceResult {
  price: number;
  was: number;
  basis: PriceBasis;
  reject?: string;
  wasFromDescription?: boolean;
}

function findWas(text: string, price: number): { was: number; basis: PriceBasis } | null {
  const tryRe = (re: RegExp, basis: PriceBasis, wasGroup = 1): { was: number; basis: PriceBasis } | null => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const v = money(m[wasGroup], m[wasGroup + 1]);
      if (v > price * 1.04 && v < price * 30) return { was: v, basis };
    }
    return null;
  };
  return (
    tryRe(new RegExp(`\\b(?:was|were|reg\\.?|regularly|regular price(?: of| is)?|list(?: price)?|msrp|orig(?:inally|\\.)?|original price|compare at|retails? (?:for|at)|normally)\\s*:?\\s*${MONEY}`, 'i'), 'labeled-was') ||
    tryRe(new RegExp(`${MONEY}\\s*(?:regular price|list price|msrp|reg\\.?\\b|retail)`, 'i'), 'labeled-was') ||
    tryRe(new RegExp(`\\b(?:from|down from)\\s+${MONEY}`, 'i'), 'from-to') ||
    tryRe(new RegExp(`${MONEY}\\s*(?:->|→|=>|⇒)\\s*\\$`, 'i'), 'from-to') ||
    tryRe(new RegExp(`(?:<(?:del|s|strike)(?:\\s[^>]*)?>\\s*|~~\\s*)${MONEY}`, 'i'), 'strikethrough')
  );
}

function parsePricing(raw: RawItem): PriceResult {
  const none = (reject: string): PriceResult => ({ price: 0, was: 0, basis: 'none', reject });

  // Structured price from the retailer page (Woot)
  if (raw.preSale && raw.preSale > 0) {
    if (raw.preList && raw.preList > raw.preSale * 1.04) return { price: raw.preSale, was: raw.preList, basis: 'retailer-list-price' };
    return { price: raw.preSale, was: 0, basis: 'none' };
  }

  const title = stripNoise(raw.title);
  const desc = stripNoise(raw.text).slice(0, 1200);
  const htmlDesc = raw.html.slice(0, 4000);

  // 1. Equation "$599 - $150 = $449" (optionally "$599 - $150 coupon = $449")
  const eq = title.match(new RegExp(`${MONEY}\\s*-\\s*${MONEY}[^=$]{0,25}=\\s*${MONEY}`, 'i'));
  if (eq) {
    const was = money(eq[1], eq[2]);
    const price = money(eq[5], eq[6]);
    if (price > 0 && was > price) return { price, was, basis: 'equation' };
  }

  // 1b. "$539.31 ($1199.00-$659.69)" : parenthesised subtraction that equals the posted price
  const eq2 = title.match(new RegExp(`${MONEY}\\s*\\(\\s*${MONEY}\\s*-\\s*${MONEY}[^)]{0,25}\\)`, 'i'));
  if (eq2) {
    const price = money(eq2[1], eq2[2]);
    const was = money(eq2[3], eq2[4]);
    const off = money(eq2[5], eq2[6]);
    if (price > 0 && was > price && Math.abs(was - off - price) < 1) return { price, was, basis: 'equation' };
  }
  if (RANGE_RE.test(title)) return none('price range');

  // Remove "$X off" / "save $X" phrases from the candidate list but remember the amount
  let dollarsOff = 0;
  const offMatch = title.match(new RegExp(`(?:\\(|\\bsave\\s+|\\bafter\\s+|\\bw\\/\\s*|\\bminus\\s+)?${MONEY}\\s*(?:off|instant savings|savings)\\b`, 'i'));
  if (offMatch && !/up to\s*$/i.test(title.slice(0, offMatch.index))) dollarsOff = money(offMatch[1], offMatch[2]);
  const titleNoOff = title
    .replace(new RegExp(`(?:\\bup to\\s+|\\bsave\\s+|\\bextra\\s+|\\bafter\\s+|\\bw\\/\\s*|\\bminus\\s+)?${MONEY}\\s*(?:off|instant savings|savings|coupon|promo|rebate|discount)\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:save|extra|clip|after)\\s+${MONEY}`, 'gi'), ' ');

  // Was price inside the title
  const titleCandidates = Array.from(new Set(allPrices(titleNoOff)));
  if (titleCandidates.length === 0 && COUPON_ONLY_RE.test(title)) return none('coupon/discount only, no item price');

  let price = 0;
  let wasInfo: { was: number; basis: PriceBasis } | null = null;

  if (titleCandidates.length === 1) {
    price = titleCandidates[0];
  } else if (titleCandidates.length >= 2) {
    // Two+ prices in a title: only accept if one is clearly labeled as the old price
    const lowest = Math.min(...titleCandidates);
    wasInfo = findWas(titleNoOff, lowest);
    const leftover = titleCandidates.filter((p) => p !== lowest && (!wasInfo || p !== wasInfo.was));
    if (!wasInfo || leftover.length > 0) return none(`multiple prices without a clear was/now marker (${titleCandidates.map((p) => '$' + p).join(', ')})`);
    price = lowest;
  } else {
    // No price in title: look for "for $X" / "at $X" / "sale for $X" / "Buy for $X" in description
    const m = desc.match(new RegExp(`\\b(?:for|at|sale for|price of|priced at|now)\\s+(?:just\\s+|only\\s+)?${MONEY}`, 'i'));
    if (!m) return none('no item price found');
    price = money(m[1], m[2]);
  }
  if (price < 5) return none('price under $5');

  if (!wasInfo) wasInfo = findWas(titleNoOff, price);
  // Description / HTML: only if the description mentions the same current price (so the pair belongs together)
  if (wasInfo) return { price, was: wasInfo.was, basis: wasInfo.basis };
  if (!wasInfo) {
    const descPrices = allPrices(desc);
    if (descPrices.some((p) => near(p, price))) wasInfo = findWas(desc, price) || findWas(htmlDesc, price);
  }
  // "was" found only in the description (often a seller-supplied list price) - shown, but never enough for a price-error flag
  if (wasInfo) return { price, was: wasInfo.was, basis: wasInfo.basis, wasFromDescription: true };

  if (dollarsOff > 0 && dollarsOff < price * 5) return { price, was: Number((price + dollarsOff).toFixed(2)), basis: 'dollars-off' };

  const pct = title.match(/(?<!up to\s)(?<!extra\s)\b(\d{1,2})\s*%\s*off\b/i);
  if (pct && !/up to\s+\d{1,2}\s*%/i.test(title)) {
    const p = parseInt(pct[1], 10);
    if (p >= 5 && p <= 95) return { price, was: Number((price / (1 - p / 100)).toFixed(2)), basis: 'percent-off' };
  }
  return { price, was: 0, basis: 'none' };
}

function detectRetailer(raw: RawItem): string {
  const hint = (raw.retailerHint || '').trim();
  const s = `${raw.title} ${raw.link} ${raw.text.slice(0, 300)}`.toLowerCase();
  const known: [RegExp, string][] = [
    [/amazon\.|\bamazon\b/, 'Amazon'],
    [/bestbuy\.|best buy/, 'Best Buy'],
    [/walmart/, 'Walmart'],
    [/newegg/, 'Newegg'],
    [/target\.com|\bat target\b|@ target/, 'Target'],
    [/costco/, 'Costco'],
    [/bhphotovideo|b&h/, 'B&H Photo'],
    [/microcenter|micro center/, 'Micro Center'],
    [/woot/, 'Woot'],
    [/meh\.com/, 'Meh'],
    [/dell\.com|\bdell\b/, 'Dell'],
    [/lenovo/, 'Lenovo'],
    [/\bhp\.com|hp store/, 'HP'],
    [/samsung\.com/, 'Samsung'],
    [/apple\.com/, 'Apple'],
    [/kohls|kohl's/, "Kohl's"],
    [/samsclub|sam's club/, "Sam's Club"],
    [/staples/, 'Staples'],
    [/homedepot|home depot/, 'Home Depot'],
    [/lowes|lowe's/, "Lowe's"],
    [/gamestop/, 'GameStop'],
    [/bj'?s|bjs wholesale/, "BJ's"],
    [/nintendo\.com|store\.nintendo/, 'Nintendo'],
    [/meta\.com|oculus/, 'Meta'],
    [/ebay/, 'eBay'],
    [/aliexpress/, 'AliExpress'],
    [/antonline/, 'Antonline'],
    [/adorama/, 'Adorama'],
  ];
  for (const [re, name] of known) if (hint && re.test(hint.toLowerCase())) return name; // feed's own store field wins
  for (const [re, name] of known) if (re.test(s)) return name;
  if (hint) return hint.charAt(0).toUpperCase() + hint.slice(1);
  try {
    const host = new URL(raw.link).hostname.replace(/^www\./, '');
    if (!/reddit|slickdeals|dealnews|9to5toys|techbargains|x\.com|twitter/.test(host)) return host;
  } catch {
    /* ignore */
  }
  return 'See source';
}

function extractAsin(raw: RawItem): string | undefined {
  const m = `${raw.link} ${raw.html}`.match(/amazon\.com\/(?:[^\s"'<>]*?\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
  return m ? m[1] : undefined;
}

function cleanSearchTitle(title: string): string {
  return title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(new RegExp(MONEY, 'g'), ' ')
    .replace(/\b(?:free (?:shipping|s&h)|\+|w\/|ymmv|prime|shipped|@|at amazon|at best buy|at walmart)\b/gi, ' ')
    .replace(/[()|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function buildCheckLinks(raw: RawItem, asin?: string): CheckPriceLink[] {
  const links: CheckPriceLink[] = [];
  if (asin) {
    links.push({ label: 'camelcamelcamel price history', uri: `https://camelcamelcamel.com/product/${asin}` });
    links.push({ label: 'Keepa price history', uri: `https://keepa.com/#!product/1-${asin}` });
  }
  const q = encodeURIComponent(cleanSearchTitle(raw.title));
  links.push({ label: 'Google Shopping prices', uri: `https://www.google.com/search?tbm=shop&q=${q}` });
  return links;
}

function extractCoupon(text: string): string | undefined {
  const m = text.match(/\b(?:[Pp]romo |[Cc]oupon )?(?:[Cc]ode|CODE)\s*[:"'*]?\s*\*?([A-Z0-9]{4,20})\b/);
  if (!m) return undefined;
  if (!/\d/.test(m[1]) && m[1].length < 5) return undefined;
  if (['CODE', 'COUPON', 'PROMO', 'FREE', 'SHIPPING'].includes(m[1])) return undefined;
  return m[1];
}

function conditionOf(title: string, text: string): GlitchDeal['condition'] {
  return detectCondition(title, text);
}

export interface Rejection {
  title: string;
  source: string;
  reason: string;
}

export function normalize(raw: RawItem, now: number): { deal?: GlitchDeal; hot?: GlitchDeal; reject?: string } {
  const maxAge = raw.isGlitchFeed ? GLITCH_MAX_AGE_MS : GENERAL_MAX_AGE_MS;
  if (now - raw.pubMs > maxAge) return { reject: 'older than age limit' };
  const t = raw.title;
  if (QUESTION_RE.test(t)) return { reject: 'question / discussion post' };
  if (NEWS_RE.test(t)) return { reject: 'news / discussion post' };
  if (ROUNDUP_RE.test(t)) return { reject: 'multi-item roundup / sale event' };
  if (SUBSCRIPTION_RE.test(t)) return { reject: 'subscription / license' };
  if (GIFT_CARD_RE.test(stripNoise(t))) return { reject: 'gift card' };
  if (REBATE_ONLY_RE.test(t) && !new RegExp(MONEY).test(t.replace(/\$\s?\d[\d,.]*\s*(?:mail-?in\s+)?rebate/gi, ''))) return { reject: 'rebate only' };
  if (MEDIA_RE.test(t) && !isKidsItem(t, raw.text)) return { reject: 'movie / game / media' };
  const kidsItem = isKidsItem(t, raw.text);
  if (MONITOR_NOISE_REGEX.test(`${t} ${raw.text.slice(0, 400)}`)) return { reject: 'not tech' };
  if (NON_TECH_RE.test(t) && !kidsItem) return { reject: 'not tech' };

  const flair = (t.match(/^\[([^\]]+)\]/) || [])[0] || '';
  const category = classify(t, flair, raw.sourceLabel) || (kidsItem ? 'other-tech' : null);
  if (!category) return { reject: 'not tech' };

  const pricing = parsePricing(raw);
  if (pricing.reject) return { reject: pricing.reject };
  const { price, was, basis } = pricing;
  const usual = was || price;
  // Accessory check on the "head" of the title: drop "w/ ...", "with ...", "for ..." clauses that describe what it goes with
  const head = t.replace(/(?:\bw\/|\b(?:with|for|fits|compatible with|includes?)\b).*$/i, '');
  const isPcCase = /\b(?:mid[- ]tower|full[- ]tower|pc case|atx case)\b|\[case\]/i.test(t);
  if (ACCESSORY_RE.test(head) && !isPcCase && usual < 100) return { reject: 'accessory under $100' };

  let discount = was > price ? Math.round(((was - price) / was) * 100) : 0;
  if (discount > 97) return { reject: `implausible pairing ($${price} vs $${was})` };
  if (discount > 0 && discount < 3) discount = 0;

  const cond = conditionOf(t, raw.text.slice(0, 400));
  const saysError = SAYS_ERROR_RE.test(t) || (raw.sourceId === 'x' && SAYS_ERROR_RE.test(raw.text));
  const strongBasis = basis !== 'none' && basis !== 'retailer-list-price';
  let isError = false;
  let reason: string | undefined;
  if (saysError) {
    isError = true;
    reason = `Source text says price error/glitch (${raw.sourceLabel})`;
  } else if (discount >= 70 && was >= 100 && was <= 20000 && strongBasis && !pricing.wasFromDescription && !cond) {
    isError = true;
    reason = `${discount}% off a marked usual price of $${was.toFixed(2)} (${basis})`;
  }

  const glitchType: GlitchType = isError ? 'Possible Price Error' : discount >= 40 ? 'Big Markdown' : discount > 0 ? 'Markdown' : 'Deal (single price)';
  const asin = extractAsin(raw);
  const retailer = detectRetailer(raw);
  const coupon = extractCoupon(`${raw.title} ${raw.text.slice(0, 400)}`);
  const savings = discount > 0 ? was - price : 0;
  const ageH = (now - raw.pubMs) / HOUR;
  const score =
    (isError ? 400 : 0) +
    discount * 2 +
    Math.min(200, savings * 0.25) +
    Math.min(120, Math.max(0, raw.upvotes || 0)) +
    Math.max(0, 60 - ageH * 2.5) +
    (category === 'other-tech' ? 0 : 25);
  const specs = raw.text
    .replace(/^Thumb Score:\s*[+-]?\d+\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const deal: GlitchDeal = {
    id: `${raw.sourceId}-${raw.pubMs}-${t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)}`,
    title: t,
    skuOrAsin: asin ? `ASIN ${asin}` : flair.replace(/[[\]]/g, ''),
    category,
    glitchType,
    isPossiblePriceError: isError,
    priceErrorReason: reason,
    originalPrice: discount > 0 ? Number(was.toFixed(2)) : 0,
    glitchPrice: Number(price.toFixed(2)),
    discountPercent: discount,
    priceBasis: discount > 0 ? basis : 'none',
    isVerifiedSinglePrice: discount === 0,
    condition: cond,
    upvoteScore: raw.upvotes,
    substanceScore: Math.round(score),
    retailer,
    sourceChannel: raw.sourceLabel,
    sourceUrl: raw.sourceUrl,
    timeDetected: new Date(raw.pubMs).toISOString(),
    detectedTimestamp: raw.pubMs,
    directBuyUrl: raw.link,
    couponCode: coupon,
    stackInstructions: coupon ? `Source mentions code ${coupon}. Confirm it applies at checkout.` : undefined,
    specsSummary: specs.length > 15 ? specs.slice(0, 220) + (specs.length > 220 ? '...' : '') : '',
    checkPriceLinks: buildCheckLinks(raw, asin),
    groundingSources: [{ title: raw.sourceLabel, uri: raw.sourceUrl }],
    isLiveGrounded: true,
    matchedRules: [],
  };
  deal.matchedRules = evaluateWatchRules({
    title: deal.title,
    text: raw.text,
    retailer: deal.retailer,
    price: deal.glitchPrice,
    was: deal.originalPrice,
    discountPercent: deal.discountPercent,
    isPossiblePriceError: deal.isPossiblePriceError,
    priceErrorReason: deal.priceErrorReason,
    category: deal.category,
    detectedTimestamp: deal.detectedTimestamp,
  });
  const hot = classifyHotDeal(deal, raw.text, now) ?? undefined;
  if (!deal.matchedRules.length) {
    if (hot) return { hot };
    return { reject: 'does not match any watch rule' };
  }
  return { deal, hot };
}


export interface FeedScanResult {
  deals: GlitchDeal[];
  hotDeals: GlitchDeal[];
  rejections: Rejection[];
  rejectedCount: number;
  sourceStatus: SourceStatus[];
  xSearchLinks: XSearchLink[];
  xAccounts: XLink[];
  scanSummary: string;
  scannedAt: string;
  scannedAtPT: string;
  queryExecuted: string;
}

async function loadSource(def: SourceDef): Promise<{ items: RawItem[]; status: SourceStatus }> {
  const started = Date.now();
  const base = {
    id: def.id,
    label: def.label,
    url: def.url,
    itemsFetched: 0,
    dealsKept: 0,
    checkedAt: new Date(started).toISOString(),
  };
  try {
    const fetched = await def.fetcher();
    const result = fetched.result;
    const items = fetched.items || [];
    const finalState: SourceState = fetched.state || (result.ok ? (items.length ? 'ok' : 'empty') : stateFromHttp(result));
    const msg = fetched.message || (result.ok ? (items.length ? undefined : 'Feed returned no items') : httpMessage(result));
    return {
      items,
      status: {
        ...base,
        state: finalState,
        httpStatus: result.status || undefined,
        message: msg || undefined,
        itemsFetched: items.length,
      },
    };
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      items: [],
      status: {
        ...base,
        state: 'error',
        message: timedOut ? 'timeout' : err?.message || 'fetch failed',
      },
    };
  }
}

export async function runFeedScan(now = Date.now()): Promise<FeedScanResult> {
  const reddit = SOURCES.filter((s) => s.id.startsWith('reddit'));
  const others = SOURCES.filter((s) => !s.id.startsWith('reddit'));
  const byId = new Map<string, { items: RawItem[]; status: SourceStatus }>();

  const loadInto = async (def: SourceDef) => {
    byId.set(def.id, await loadSource(def));
  };

  const othersPromise = Promise.all(others.map((s) => loadInto(s)));
  for (let i = 0; i < reddit.length; i++) {
    await loadInto(reddit[i]);
    if (i < reddit.length - 1) await new Promise((r) => setTimeout(r, 3000));
  }
  await othersPromise;

  const all = SOURCES.flatMap((s) => byId.get(s.id)?.items || []);
  const seen = new Set<string>();
    const deals: GlitchDeal[] = [];
    const hotPool: GlitchDeal[] = [];
    const rejections: Rejection[] = [];
    const kept = new Map<string, number>();
    for (const raw of all) {
      const key = raw.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const { deal, hot, reject } = normalize(raw, now);
      if (deal) {
        deals.push(deal);
        kept.set(raw.sourceId, (kept.get(raw.sourceId) || 0) + 1);
      }
      if (hot) {
        hotPool.push(hot);
        if (!deal) kept.set(raw.sourceId, (kept.get(raw.sourceId) || 0) + 1);
      } else if (!deal && reject && reject !== 'older than age limit') {
        rejections.push({ title: raw.title, source: raw.sourceLabel, reason: reject });
      }
    }
    deals.sort((a, b) => (b.substanceScore || 0) - (a.substanceScore || 0));
    const hotDeals = rankHotDeals(hotPool);

  const sourceStatus: SourceStatus[] = SOURCES.map((s) => {
    const row = byId.get(s.id);
    if (!row) {
      return { id: s.id, label: s.label, url: s.url, state: 'error' as SourceState, message: 'not fetched', itemsFetched: 0, dealsKept: 0, checkedAt: new Date(now).toISOString() };
    }
    return { ...row.status, dealsKept: kept.get(s.id) || 0 };
  });

  const okCount = sourceStatus.filter((s) => s.state === 'ok' || s.state === 'cached').length;
  const errCount = deals.filter((d) => d.isPossiblePriceError).length;
  const scannedAt = new Date(now).toISOString();

  return {
    deals,
    rejections,
    rejectedCount: rejections.length,
    sourceStatus,
    xSearchLinks: X_SEARCH_LINKS,
    xAccounts: X_DEAL_ACCOUNTS,
    hotDeals,
    scanSummary: `${deals.length} watch-rule matches and ${hotDeals.length} hot deals kept from ${all.length} fetched posts across ${okCount}/${SOURCES.length} working sources; ${rejections.length} filtered out. ${errCount} flagged as possible price errors.`,
    scannedAt,
    scannedAtPT: formatPT(now),
    queryExecuted: 'Free RSS/JSON deal feeds (zero AI, no paid APIs)',
  };
}
