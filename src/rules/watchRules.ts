/**
 * Oscar Medina's exact deal-watch and alert rules.
 * Pure TypeScript — no AI, no network. Safe to unit-test.
 */

export type WatchRuleId =
  | 'tech-clearance'
  | 'cyber-laptop'
  | 'mac-mini'
  | 'kids'
  | 'local-ai'
  | 'christmas-2026';

export type DealCondition = 'New' | 'Refurbished' | 'Open-Box' | 'Used' | 'Unverified condition';

export interface RuleMatch {
  ruleId: WatchRuleId;
  label: string;
  reason: string;
}

export interface WatchInput {
  title: string;
  text?: string;
  retailer: string;
  price: number;
  was: number;
  discountPercent: number;
  isPossiblePriceError: boolean;
  priceErrorReason?: string;
  category?: string;
  detectedTimestamp?: number;
  nowMs?: number;
}

export const RULE_LABELS: Record<WatchRuleId, string> = {
  'tech-clearance': 'Tech & Clearance',
  'cyber-laptop': 'Cyber Laptop Watch',
  'mac-mini': 'Mac mini Watch',
  kids: 'Kids Watch',
  'local-ai': 'Local AI Machine Watch',
  'christmas-2026': 'Christmas 2026 Watch',
};

export const MAJOR_LEGIT_STORES = [
  'Best Buy',
  'Walmart',
  "Kohl's",
  'Kohls',
  'Costco',
  "Sam's Club",
  'Sams Club',
  'Amazon',
  'Micro Center',
  'Staples',
  'Home Depot',
  "Lowe's",
  'Lowes',
  'B&H',
  'B&H Photo',
  'Newegg',
  'Dell',
  'Lenovo',
  'HP',
  'Apple',
  'Woot',
  'Target',
] as const;

/** Broader 1P / official / major-retailer list used for most watch rules. */
export const LEGIT_RETAILERS = [
  ...MAJOR_LEGIT_STORES,
  'Meh',
  'Adorama',
  'GameStop',
  'Nintendo',
  'Meta',
  'Oculus',
  'Microsoft',
  'Samsung',
  'Sony',
  'B&H Photo Video',
  'BH Photo',
  'Costco Wholesale',
  'BestBuy',
  'Walmart.com',
  'Amazon.com',
  'Apple Store',
  'Dell Outlet',
  'HP Store',
  "Lenovo.com",
] as const;

const SCAM_OR_MARKETPLACE_RE =
  /\b(?:ebay|ali ?express|temu|wish\.com|\bwish\b|facebook marketplace|offerup|mercari|craigslist|poshmark|depop|tiktok shop|shein|dhgate|geekbuying|tomtop)\b/i;

const THIRD_PARTY_AMAZON_RE =
  /\b(?:sold by (?!amazon)[a-z0-9][^,.]{0,40}|third[- ]party|3rd[- ]party|marketplace seller|fulfilled by merchant)\b/i;

const ACCESSORY_RE =
  /\b(?:case|cases|cover|folio|pencil|screen protector|tempered glass|cable|cord|charger|charging|adapter|mount|stand|stylus|skin|sleeve|bag|backpack|strap|band|dock|hub|remote|grip|mouse ?pad|desk ?mat|power bank|portable charger|wall plate|cleaning|filter|screen door)\b/i;

const TABLET_RE =
  /\b(?:ipad|galaxy tab|fire tablet|fire hd|kindle fire|android tablet|\btablet\b)\b/i;

const LAPTOP_OR_DESKTOP_RE =
  /\b(?:laptop|laptops|notebook|macbook|thinkpad|ideapad|loq|galaxy book|lg gram|predator|helios|nitro|rog (?:strix|zephyrus|flow)|tuf gaming|razer blade|pavilion|aspire|swift|probook|elitebook|yoga|zenbook|vivobook|legion|omen|victus|alienware|xps|inspiron|latitude|spectre|envy|surface (?:laptop|pro)|desktop|prebuilt|gaming pc|mini pc|mac mini|mac studio|imac|nuc|all-in-one pc)\b/i;

const CHROMEBOOK_RE = /\bchromebook\b/i;

const TV_RE = /\b(?:tv|tvs|television|oled|qled|qned|mini[- ]?led|bravia)\b/i;
const MONITOR_ONLY_RE = /\b(?:monitor|monitors|ultrawide|odyssey g\d|ultragear)\b/i;

const MAC_MINI_RE = /\bmac\s*mini\b/i;
const APPLE_SILICON_RE = /\b(?:m1|m2|m3|m4|m5)(?:\s*(?:pro|max|ultra|air))?\b/i;
const WINDOWS_RE = /\b(?:windows|win\s?11|win\s?10|w11|w10)\b/i;

const CLEARANCE_RE = /\b(?:clearance|closeout|close-out|on clearance|clearance price|clearance sale)\b/i;

const KIDS_RE =
  /\b(?:baby|infant|newborn|toddler|kids?|girls?|boy'?s|children'?s|lego|duplo|dolls?|barbie|play[- ]?doh|crayola|stroller|car seat|booster seat|high chair|pack ?n[- ]?play|crib|bassinet|diaper|onesie|pajama|pjs|scooter|skateboard|balance bike|kids bike|bicycle|keyboard piano|piano|keyboard(?:s)?|ukulele|xylophone|music toy|art supplies|coloring|markers|colored pencils|watercolor|easel|board game|card game|nintendo.*(kids|junior)|fire (?:7|hd 8|hd 10)|kids tablet|hornsit|baby gear)\b/i;

const KIDS_TABLET_RE = /\b(?:kids? tablet|fire 7|fire hd 8|fire hd 10|amazon kids|tablet for kids)\b/i;

export function detectCondition(title: string, text = ''): DealCondition {
  const hay = `${title} ${text}`;
  if (/\b(?:refurb(?:ished)?|renewed|recertified|reconditioned)\b/i.test(hay)) return 'Refurbished';
  if (/\bopen[- ]box\b/i.test(hay)) return 'Open-Box';
  if (/\b(?:used|pre-?owned|second[- ]hand)\b/i.test(hay)) return 'Used';
  if (/\b(?:brand new|factory sealed|new sealed|new in box|nib\b|new[- ]only)\b/i.test(hay) || /\bcondition:\s*new\b/i.test(hay)) {
    return 'New';
  }
  return 'Unverified condition';
}

export function isMajorLegitStore(retailer: string): boolean {
  const r = retailer.trim().toLowerCase();
  return MAJOR_LEGIT_STORES.some((s) => r === s.toLowerCase() || r.includes(s.toLowerCase()));
}

export function isLegitRetailer(retailer: string, title = '', text = ''): boolean {
  const hay = `${title} ${text} ${retailer}`;
  if (SCAM_OR_MARKETPLACE_RE.test(hay)) return false;
  if (/amazon/i.test(retailer) && THIRD_PARTY_AMAZON_RE.test(hay)) return false;
  const r = retailer.trim().toLowerCase();
  if (!r || r === 'see source') return false;
  return LEGIT_RETAILERS.some((s) => r === s.toLowerCase() || r.includes(s.toLowerCase()));
}

export function isChristmasFirstPartyRetailer(retailer: string, title = '', text = ''): boolean {
  if (!isLegitRetailer(retailer, title, text)) return false;
  // Christmas rule is 1P only — skip clearly third-party / marketplace language even at a major store name.
  if (THIRD_PARTY_AMAZON_RE.test(`${title} ${text}`)) return false;
  return true;
}

function isAccessoryTitle(title: string): boolean {
  const head = title.replace(/(?:\bw\/|\b(?:with|for|fits|compatible with|includes?)\b).*$/i, '');
  const isPcCase = /\b(?:mid[- ]tower|full[- ]tower|pc case|atx case)\b|\[case\]/i.test(title);
  return ACCESSORY_RE.test(head) && !isPcCase;
}

export function parseTvInches(title: string): number | null {
  // Do not require a word boundary after a quote — "55\"" is followed by a space, which is not a \b.
  const m = title.match(/\b([1-9]\d{1,2})\s*(?:["”]|''|in(?:ch(?:es)?)?|-inch|inch|class)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 19 && n <= 120 ? n : null;
}

function isTv(title: string): boolean {
  if (/\b(?:fire tv stick|fire tv cube|apple tv|roku (?:stick|ultra|express|streaming|player)|chromecast|streaming stick|tv box|tv stand|tv mount|tv antenna)\b/i.test(title)) {
    return false;
  }
  if (MONITOR_ONLY_RE.test(title) && !TV_RE.test(title)) return false;
  return TV_RE.test(title) || parseTvInches(title) !== null && /\btv\b/i.test(title);
}

function ramGb(hay: string): number | null {
  const matches = [...hay.matchAll(/\b(\d{1,3})\s*gb(?:\s*(?:ddr\d|lpddr\d|ram|memory|unified))?\b/gi)];
  const rams: number[] = [];
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    // skip storage-looking numbers near ssd/hdd/emmc or common storage sizes if followed by storage words
    const labeledRam = /ram|memory|unified|lpddr|ddr/i.test(m[0]);
    const after = hay.slice(m.index! + m[0].length, m.index! + m[0].length + 16).toLowerCase();
    const before = hay.slice(Math.max(0, m.index! - 12), m.index!).toLowerCase();
    const looksLikeStorage = /\b(?:ssd|hdd|nvme|emmc|storage|ufs)\b/.test(after) || /\b(?:ssd|hdd|nvme|storage)\b/.test(before);
    // Skip storage sizes unless this token is explicitly labeled as RAM/memory.
    if (looksLikeStorage && !labeledRam) continue;
    // Skip VRAM sizes sitting on a GPU name (8GB after RTX 4060) unless labeled RAM.
    if (!labeledRam && /rtx|geforce|radeon|gtx|vram|graphics/i.test(before) && n <= 24) continue;
    if ([4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128].includes(n)) rams.push(n);
  }
  if (!rams.length) {
    const uni = hay.match(/\b(\d{1,3})\s*gb\s+(?:unified|ram|memory|lpddr)/i);
    if (uni) return parseInt(uni[1], 10);
    return null;
  }
  // Prefer typical RAM sizes; if both 16 and 512 appear we already skipped storage-adjacent.
  return Math.max(...rams.filter((n) => n <= 192));
}

function hasSsd(hay: string): boolean {
  return /\b(?:ssd|nvme|m\.2|solid state|pcle|pcie gen)\b/i.test(hay);
}

function isUpgradeable8Gb(hay: string): boolean {
  return (
    /\b8\s*gb\b/i.test(hay) &&
    /\b(?:upgradeable|upgradable|upgradable ram|max(?:imum)?\s*\d+\s*gb|so-?dimm|empty ram slot|two[- ]slot ram)\b/i.test(hay)
  );
}

function hasOnly4GbRam(hay: string): boolean {
  const gb = ramGb(hay);
  if (gb === 4) return true;
  if (/\b4\s*gb\s+(?:ram|ddr|memory|lpddr)\b/i.test(hay) && !/\b(?:8|12|16|32|64)\s*gb\s+(?:ram|ddr|memory|lpddr)\b/i.test(hay)) {
    return true;
  }
  return false;
}

export function has12GbPlusNvidiaGpu(hay: string): { ok: boolean; reason?: string } {
  const t = hay.replace(/\s+/g, ' ');
  // Explicit VRAM
  if (/\brtx\s*30\s*60(?!\s*ti)\b/i.test(t)) {
    if (/\b12\s*gb\b/i.test(t)) return { ok: true, reason: 'RTX 3060 12GB' };
    return { ok: false };
  }
  if (/\brtx\s*30\s*80\s*ti\b/i.test(t)) return { ok: true, reason: 'RTX 3080 Ti 12GB' };
  if (/\brtx\s*30\s*80(?!\s*ti)\b/i.test(t)) {
    if (/\b12\s*gb\b/i.test(t)) return { ok: true, reason: 'RTX 3080 12GB' };
    return { ok: false }; // 3080 10GB does not qualify
  }
  if (/\brtx\s*30\s*90\s*ti\b/i.test(t)) return { ok: true, reason: 'RTX 3090 Ti' };
  if (/\brtx\s*30\s*90\b/i.test(t)) return { ok: true, reason: 'RTX 3090 24GB' };
  if (/\brtx\s*40\s*60\s*ti\b/i.test(t)) {
    if (/\b16\s*gb\b/i.test(t)) return { ok: true, reason: 'RTX 4060 Ti 16GB' };
    return { ok: false };
  }
  if (/\brtx\s*50\s*60\s*ti\b/i.test(t)) {
    if (/\b16\s*gb\b/i.test(t)) return { ok: true, reason: 'RTX 5060 Ti 16GB' };
    return { ok: false };
  }
  if (/\brtx\s*40\s*70\s*(?:super|ti)?/i.test(t) || /\brtx\s*40\s*80/i.test(t) || /\brtx\s*40\s*90/i.test(t)) {
    const m = t.match(/\brtx\s*40(\d{2}(?:\s*(?:super|ti))?)/i);
    return { ok: true, reason: `RTX 40${m ? m[1].replace(/\s+/g, '') : '70+'} 12GB+` };
  }
  if (/\brtx\s*50\s*70/i.test(t) || /\brtx\s*50\s*80/i.test(t) || /\brtx\s*50\s*90/i.test(t)) {
    return { ok: true, reason: 'RTX 5070+ 12GB+' };
  }
  // Generic "RTX .... 12GB/16GB/24GB VRAM"
  if (/\brtx\b/i.test(t) && /\b(12|16|20|24|32)\s*gb(?:\s*vram)?\b/i.test(t) && !/\brtx\s*40\s*60(?!\s*ti)\b/i.test(t)) {
    return { ok: true, reason: 'NVIDIA RTX with 12GB+ VRAM stated' };
  }
  return { ok: false };
}

function has8GbPlusRtx(hay: string): boolean {
  if (!/\brtx\b/i.test(hay)) return false;
  if (/\b(?:8|10|12|16|20|24|32)\s*gb(?:\s*vram)?\b/i.test(hay)) return true;
  // Common cards that are 8GB+
  return /\brtx\s*(?:2060|2070|2080|3060|3070|3080|3090|4060|4070|4080|4090|5060|5070|5080|5090)/i.test(hay);
}

function isLaptop(title: string): boolean {
  return /\b(?:laptop|notebook|macbook|chromebook|thinkpad|ideapad|galaxy book|surface laptop|razer blade|zenbook|vivobook|yoga slim|legion|omen|victus|alienware|xps|inspiron|latitude|spectre|envy|swift|aspire|pavilion|probook|elitebook|loq|lg gram)\b/i.test(
    title
  );
}

function isDesktop(title: string): boolean {
  return /\b(?:desktop|prebuilt|gaming pc|mini pc|mac mini|mac studio|imac|nuc|all-in-one pc|tower)\b/i.test(title);
}

export function isKidsItem(title: string, text = ''): boolean {
  const hay = `${title} ${text}`;
  return KIDS_RE.test(hay) || KIDS_TABLET_RE.test(hay);
}

const CHRISTMAS_END_MS = Date.parse('2026-12-26T07:59:59.000Z'); // Dec 25, 2026 23:59:59 America/Los_Angeles (PST, UTC-8)

export function isChristmasWatchActive(nowMs = Date.now()): boolean {
  return nowMs <= CHRISTMAS_END_MS;
}

function effectivePriceAfterGiftCard(title: string, text: string, price: number): { effective: number; giftCard: number } {
  const hay = `${title} ${text}`;
  const m = hay.match(/(?:\$\s?(\d{1,4}(?:\.\d{1,2})?)\s*(?:[A-Za-z'’]+\s+){0,3}(?:e-?gift cards?|gift cards?|gc|store credit)|\+\s*\$\s?(\d{1,4}(?:\.\d{1,2})?)\s*(?:gc|gift card))/i);
  const giftCard = m ? parseFloat(m[1] || m[2] || '0') : 0;
  return { effective: giftCard > 0 ? Number((price - giftCard).toFixed(2)) : price, giftCard };
}

function isBaselineQuest3sPromo(title: string, text: string, price: number): boolean {
  const hay = `${title} ${text}`;
  const is3s = /\b(?:quest\s*3s|meta\s*quest\s*3s)\b/i.test(hay);
  if (!is3s) return false;
  const { giftCard } = effectivePriceAfterGiftCard(title, text, price);
  return price >= 297 && price <= 299.99 && giftCard === 50;
}

function isBaselineSwitch2MarioKartPromo(title: string, text: string, price: number): boolean {
  const hay = `${title} ${text}`;
  const isSw2 = /\b(?:switch\s*2|nintendo\s*switch\s*2)\b/i.test(hay);
  if (!isSw2) return false;
  const hasMK = /\bmario\s*kart(?:\s*world)?\b/i.test(hay);
  return hasMK && price >= 499 && price <= 499.99;
}

function hasStrongSwitch2BundleBonus(title: string, text: string, price: number): boolean {
  const hay = `${title} ${text}`;
  if (!/\b(?:switch\s*2|nintendo\s*switch\s*2)\b/i.test(hay)) return false;
  const { giftCard } = effectivePriceAfterGiftCard(title, text, price);
  if (giftCard >= 75) return true;
  // Extra game beyond the standard Mario Kart World promo, or a meaningful accessory bundle
  const extraGame = /\b(?:extra game|\+\s*game|bundle includes\s+(?:(?!mario kart).)+game|2 games|two games)\b/i.test(hay);
  const extraAcc = /\b(?:pro controller|wheel|camera|carrying case|game bundle|accessory bundle)\b/i.test(hay) && /\bbundle\b/i.test(hay);
  return (extraGame || extraAcc) && price <= 549;
}

export function evaluateWatchRules(input: WatchInput): RuleMatch[] {
  const title = input.title || '';
  const text = input.text || '';
  const hay = `${title} ${text}`;
  const price = Number(input.price) || 0;
  const was = Number(input.was) || 0;
  const discount = Number(input.discountPercent) || 0;
  const condition = detectCondition(title, text);
  const usedLike = condition === 'Refurbished' || condition === 'Open-Box' || condition === 'Used';
  const legit = isLegitRetailer(input.retailer, title, text);
  const major = isMajorLegitStore(input.retailer);
  const matches: RuleMatch[] = [];

  if (price <= 0) return matches;

  // --- 2) Cyber Laptop (new or refurb/open-box/used, labeled) ---
  if (legit && isLaptop(title) && !CHROMEBOOK_RE.test(hay) && price <= 200) {
    const ram = ramGb(hay);
    const ramOk = (ram !== null && ram >= 16) || isUpgradeable8Gb(hay);
    const ssd = hasSsd(hay);
    const not4 = !hasOnly4GbRam(hay);
    const windowsOk = WINDOWS_RE.test(hay) || (!/\b(?:macbook|chromebook|macos)\b/i.test(hay) && isLaptop(title));
    // Require a Windows hint or generic PC laptop (exclude MacBook from this watch)
    const isMacbook = /\bmacbook\b/i.test(hay);
    if (windowsOk && !isMacbook && ramOk && ssd && not4) {
      const ramReason = ram !== null && ram >= 16 ? `${ram}GB RAM` : '8GB RAM upgradeable';
      matches.push({
        ruleId: 'cyber-laptop',
        label: RULE_LABELS['cyber-laptop'],
        reason: `Windows laptop, ${ramReason}, SSD, $${price.toFixed(2)} ≤ $200 (${condition})`,
      });
    }
  }

  // --- 3) Mac mini (new or refurb, labeled) ---
  if (legit && MAC_MINI_RE.test(hay) && APPLE_SILICON_RE.test(hay) && price <= 300) {
    const chip = (hay.match(/\b((?:m1|m2|m3|m4|m5)(?:\s*(?:pro|max|ultra))?)\b/i) || [])[1] || 'Apple Silicon';
    matches.push({
      ruleId: 'mac-mini',
      label: RULE_LABELS['mac-mini'],
      reason: `Apple Mac mini ${chip.trim()}, $${price.toFixed(2)} ≤ $300 (${condition})`,
    });
  }

  // --- 5) Local AI Machine (new, refurb, or open-box; Used excluded) ---
  if (legit && condition !== 'Used') {
    const gpu = has12GbPlusNvidiaGpu(hay);
    if (gpu.ok && price <= 200 && !isLaptop(title) && !isDesktop(title)) {
      matches.push({
        ruleId: 'local-ai',
        label: RULE_LABELS['local-ai'],
        reason: `${gpu.reason} GPU, $${price.toFixed(2)} ≤ $200 (${condition})`,
      });
    }
    const desktopLike = isDesktop(title) || /\b(?:prebuilt|gaming pc|desktop pc)\b/i.test(hay);
    const ram = ramGb(hay);
    if (desktopLike && has8GbPlusRtx(hay) && ram !== null && ram >= 16 && hasSsd(hay) && price <= 500) {
      matches.push({
        ruleId: 'local-ai',
        label: RULE_LABELS['local-ai'],
        reason: `RTX desktop, 8GB+ VRAM, ${ram}GB RAM, SSD, $${price.toFixed(2)} ≤ $500 (${condition})`,
      });
    }
    const isAppleMac = /\b(?:macbook|mac mini|mac studio|imac|mac pro)\b/i.test(hay);
    if (isAppleMac && APPLE_SILICON_RE.test(hay) && ram !== null && ram >= 16 && price <= 450) {
      matches.push({
        ruleId: 'local-ai',
        label: RULE_LABELS['local-ai'],
        reason: `Apple Silicon Mac, ${ram}GB RAM, $${price.toFixed(2)} ≤ $450 (${condition})`,
      });
    }
  }

  // --- 6) Christmas 2026 (new only, 1P, through Dec 25, 2026) ---
  const now = input.nowMs ?? Date.now();
  if (isChristmasWatchActive(now) && !usedLike && isChristmasFirstPartyRetailer(input.retailer, title, text)) {
    const isQuest3s = /\b(?:quest\s*3s|meta\s*quest\s*3s)\b/i.test(hay);
    const isQuest3 = /\b(?:meta\s*)?quest\s*3\b/i.test(hay) && !isQuest3s;
    const isLite = /\bswitch\s*lite\b/i.test(hay);
    const isSwitch2 = /\b(?:switch\s*2|nintendo\s*switch\s*2)\b/i.test(hay);
    const isSwitchOled = /\b(?:switch\s*oled|nintendo\s*switch\s*oled|oled\s*switch)\b/i.test(hay);
    // Require "Nintendo Switch" (or OLED/Lite/Switch 2, already handled). Bare "switch" matches keyboard switches.
    const isSwitchBase = /\bnintendo\s+switch\b/i.test(hay) && !isLite && !isSwitch2 && !isSwitchOled;
    const consoleHit = isQuest3s || isQuest3 || isLite || isSwitch2 || isSwitchOled || isSwitchBase;
    if (consoleHit && !isAccessoryTitle(title)) {
      const { effective } = effectivePriceAfterGiftCard(title, text, price);
      let reason: string | null = null;
      if (input.isPossiblePriceError) {
        reason = `Clear price error on a 1P console listing (${input.priceErrorReason || 'flagged as possible price error'})`;
      } else if (isQuest3s && !isBaselineQuest3sPromo(title, text, price) && (price < 270 || effective < 250)) {
        reason = `Quest 3S at $${price.toFixed(2)}${effective < price ? ` (effective $${effective.toFixed(2)})` : ''} (thresholds: < $270 or effective < $250)`;
      } else if (isQuest3 && price < 420) {
        reason = `Quest 3 at $${price.toFixed(2)} < $420`;
      } else if (isLite && price < 175) {
        reason = `Switch Lite at $${price.toFixed(2)} < $175`;
      } else if ((isSwitchOled || isSwitchBase) && price < 275) {
        reason = `${isSwitchOled ? 'Switch OLED' : 'Nintendo Switch'} at $${price.toFixed(2)} < $275`;
      } else if (isSwitch2 && !isBaselineSwitch2MarioKartPromo(title, text, price) && (price < 499 || hasStrongSwitch2BundleBonus(title, text, price))) {
        reason = price < 499
          ? `Switch 2 at $${price.toFixed(2)} < $499`
          : `Switch 2 at $${price.toFixed(2)} with a strong extra bundle bonus (not the baseline Mario Kart World promo)`;
      }
      if (reason) {
        matches.push({ ruleId: 'christmas-2026', label: RULE_LABELS['christmas-2026'], reason });
      }
    }
  }

  // --- 4) Kids Watch (new only, 65%+ or price error) ---
  if (!usedLike && legit && isKidsItem(title, text)) {
    if (input.isPossiblePriceError) {
      matches.push({
        ruleId: 'kids',
        label: RULE_LABELS.kids,
        reason: `Kids/baby item with a clear price mistake (${input.priceErrorReason || 'flagged as possible price error'})`,
      });
    } else if (discount >= 65 && was >= price && was > 0) {
      matches.push({
        ruleId: 'kids',
        label: RULE_LABELS.kids,
        reason: `Kids/baby/girls item, ${discount}% off a marked usual price of $${was.toFixed(2)}`,
      });
    }
  }

  // --- 1) Tech & Clearance (not refurbished/open-box/used) ---
  const kids = isKidsItem(title, text);
  if (!usedLike && legit && (!kids || TABLET_RE.test(title))) {
    const accessory = isAccessoryTitle(title);
    let techReason: string | null = null;
    if (input.isPossiblePriceError) {
      techReason = `Clear price error / glitch (${input.priceErrorReason || 'flagged as possible price error'})`;
    } else if (discount >= 70 && was >= 100) {
      techReason = `${discount}% off a marked usual price of $${was.toFixed(2)} (≥ 70% off, usual ≥ $100)`;
    } else if (discount >= 60 && major && CLEARANCE_RE.test(hay)) {
      techReason = `${discount}% off clearance at major legit store ${input.retailer} (≥ 60% off)`;
    } else if (discount >= 65 && was >= 100) {
      techReason = `${discount}% off new tech with usual price $${was.toFixed(2)} (≥ 65% off, usual ≥ $100)`;
    } else if (!accessory && TABLET_RE.test(title) && price <= 50) {
      techReason = `Tablet (not an accessory) at $${price.toFixed(2)} ≤ $50`;
    } else if (!accessory && (isLaptop(title) || isDesktop(title)) && price <= 150) {
      techReason = `${isLaptop(title) ? 'Laptop' : 'Desktop'} (not an accessory) at $${price.toFixed(2)} ≤ $150`;
    } else if (isTv(title)) {
      const inches = parseTvInches(title);
      if (inches !== null && inches >= 55 && price <= 150) {
        techReason = `${inches}" TV at $${price.toFixed(2)} ≤ $150`;
      } else if (price <= 100) {
        techReason = `TV at $${price.toFixed(2)} ≤ $100`;
      }
    }
    if (techReason) {
      matches.push({ ruleId: 'tech-clearance', label: RULE_LABELS['tech-clearance'], reason: techReason });
    }
  }

  return matches;
}

export function fingerprintDeal(input: { id?: string; title: string; retailer: string; price: number }): string {
  const title = (input.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80);
  const retailer = (input.retailer || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const price = Number(input.price || 0).toFixed(2);
  return `${retailer}|${price}|${title}`;
}

export const PRICE_ERROR_DISCORD_CAUTION =
  'Caution: stores often cancel price-mistake orders — confirm the price in your cart and do not count on the order shipping.';
