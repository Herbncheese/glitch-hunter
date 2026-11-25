/**
 * Public Woot / Sellout offer discovery via the Discourse forum search
 * (forums.woot.com/search.json) and the offer HTML page. No store API.
 */

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;

function money(whole: string, cents?: string): number {
  const n = parseFloat(`${whole.replace(/,/g, '')}${cents ? `.${cents.padEnd(2, '0')}` : ''}`);
  return Number.isNaN(n) ? 0 : n;
}

function decode(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export interface ForumOfferRef {
  title: string;
  slug: string;
  createdMs: number;
}

export function topicsFromForumSearch(json: unknown, limit: number): ForumOfferRef[] {
  const topics = (json as { topics?: unknown })?.topics;
  if (!Array.isArray(topics)) return [];
  const out: ForumOfferRef[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') continue;
    const row = topic as { title?: unknown; slug?: unknown; created_at?: unknown };
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    const createdMs = Date.parse(String(row.created_at || ''));
    if (!slug || seen.has(slug) || Number.isNaN(createdMs)) continue;
    seen.add(slug);
    out.push({ title: decode(String(row.title || '')), slug, createdMs });
    if (out.length >= limit) break;
  }
  return out;
}

export interface ParsedOffer {
  sale: number;
  list: number;
  soldOut: boolean;
  /** Short page title text used only for condition detection. Not a newness claim. */
  conditionText: string;
}

export function parseWootOfferHtml(html: string): ParsedOffer | null {
  const block = (html.match(/<div class="price-exact"[\s\S]{0,800}/i) || [])[0];
  if (!block) return null;
  const sale = block.match(new RegExp(`class="price"[^>]*>\\s*${MONEY}`, 'i'));
  const list = block.match(new RegExp(`class="list-price"[^>]*>\\s*${MONEY}`, 'i'));
  const saleV = sale ? money(sale[1], sale[2]) : 0;
  if (!saleV) return null;
  const titleTag = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const offerTitle = (html.match(/var offerTitle = "([^"]*)"/) || [])[1] || '';
  const soldOut = /sold out/i.test(titleTag);
  return {
    sale: saleV,
    list: list ? money(list[1], list[2]) : 0,
    soldOut,
    conditionText: decode(`${offerTitle} ${titleTag}`).slice(0, 400),
  };
}
