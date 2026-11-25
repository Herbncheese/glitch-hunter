import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlitchDeal } from '../types/deals.ts';
import { dealsForDiscord } from './hotDeals.ts';
import {
  couponFromPost,
  dealDedupeKey,
  dedupeByStoreAndTitle,
  dedupeCoupons,
  isBlackFridayText,
  rankByRealDiscount,
} from './blackFriday.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

function titlesFromFixture(name: string): { title: string; link: string }[] {
  const xml = fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => {
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    return { title: title.trim(), link: link.trim() };
  });
}

function deal(partial: Partial<GlitchDeal> & Pick<GlitchDeal, 'title' | 'retailer' | 'glitchPrice' | 'originalPrice' | 'discountPercent'>): GlitchDeal {
  return {
    id: partial.title,
    skuOrAsin: '',
    category: 'tvs-monitors',
    glitchType: 'Markdown',
    isPossiblePriceError: false,
    priceBasis: 'labeled-was',
    sourceChannel: 'Slickdeals Black Friday',
    sourceUrl: 'https://example.com/deal',
    timeDetected: '2026-11-25T00:00:00.000Z',
    detectedTimestamp: Date.parse('2026-11-25T00:00:00Z'),
    directBuyUrl: 'https://www.bestbuy.com/site/example',
    specsSummary: '',
    checkPriceLinks: [],
    matchedRules: [],
    ...partial,
  };
}

describe('Black Friday fixture ranking and dedupe', () => {
  it('reads the RSS fixture and keeps the deeper Best Buy discount once', () => {
    const posts = titlesFromFixture('slickdeals-bf-snippet.xml');
    assert.equal(posts.length, 3);
    assert.ok(posts.every((post) => isBlackFridayText(post.title) || /was \$/.test(post.title)));
    const deals = [
      deal({ title: posts[0].title, retailer: 'Best Buy', glitchPrice: 199.99, originalPrice: 449.99, discountPercent: 56, directBuyUrl: posts[0].link }),
      deal({ title: posts[1].title, retailer: 'Best Buy', glitchPrice: 199.99, originalPrice: 399, discountPercent: 50, directBuyUrl: posts[1].link, sourceChannel: 'DealNews Electronics' }),
      deal({ title: posts[2].title, retailer: 'Best Buy', glitchPrice: 149.99, originalPrice: 249.99, discountPercent: 40, directBuyUrl: posts[2].link }),
    ];
    assert.equal(dealDedupeKey(deals[0]), dealDedupeKey(deals[1]));
    const ranked = rankByRealDiscount(dedupeByStoreAndTitle(deals));
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].discountPercent, 56);
    assert.match(ranked[0].title, /Hisense/);
    assert.match(ranked[1].title, /Nitro/);
  });
});

describe('coupon fixture', () => {
  const now = Date.parse('2026-11-25T20:00:00Z');
  const stores = ['Best Buy', "Kohl's", 'Amazon'];

  it('keeps an in-date code, drops an expired duplicate, and ignores stores outside the list', () => {
    const posts = titlesFromFixture('coupon-code-snippet.xml');
    const coupons = dedupeCoupons(
      posts
        .map((post) => couponFromPost({ title: post.title, link: post.link, sourceLabel: 'Slickdeals coupon codes', seenMs: now, stores, nowMs: now }))
        .filter((coupon): coupon is NonNullable<typeof coupon> => Boolean(coupon))
    );
    assert.deepEqual(coupons.map((coupon) => `${coupon.store}:${coupon.code}`), ["Kohl's:TAKE20", 'Best Buy:BFSAVE10']);
    const kohls = coupons.find((coupon) => coupon.code === 'TAKE20');
    assert.equal(kohls?.expiresAt, '2026-11-30');
    assert.ok(kohls?.seenAtPT);
    assert.equal(coupons.some((coupon) => coupon.code === 'THANKS26'), false);
  });
});

describe('Black Friday stays off Discord', () => {
  it('does not alert a hot-only ad deal', () => {
    const ad = deal({ title: 'Black Friday TV $199', retailer: 'Best Buy', glitchPrice: 199, originalPrice: 400, discountPercent: 50, matchedRules: [] });
    assert.equal(dealsForDiscord([ad]).length, 0);
  });
});
