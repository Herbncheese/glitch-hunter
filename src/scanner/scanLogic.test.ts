import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_ERROR_DISCORD_CAUTION } from '../rules/watchRules.ts';
import type { GlitchDeal } from '../types/deals.ts';
import { buildDiscordMessage } from './discord.ts';
import { X_DEAL_ACCOUNTS } from '../data/xLinks.ts';
import { normalize, type RawItem } from './engine.ts';
import { assertNoSecrets, containsSecret, scrubSecrets } from './secrets.ts';
import { emptySeen, isBaselineState, planAlerts } from './state.ts';
import { formatPT } from './time.ts';

function raw(partial: Partial<RawItem> & Pick<RawItem, 'title'>): RawItem {
  return {
    text: '',
    html: '',
    link: 'https://www.example.com/deal',
    sourceUrl: 'https://slickdeals.net/f/1',
    pubMs: Date.now(),
    sourceId: 'sd-tv',
    sourceLabel: 'Slickdeals TV search',
    ...partial,
  };
}

describe('Pacific timestamps', () => {
  it('formats November as PST and July as PDT', () => {
    assert.match(formatPT(Date.parse('2026-11-13T18:00:00Z')), /Nov 13, 2026/);
    assert.match(formatPT(Date.parse('2026-11-13T18:00:00Z')), /PST/);
    assert.match(formatPT(Date.parse('2026-07-13T18:00:00Z')), /PDT/);
  });
});

describe('baseline and fingerprints', () => {
  it('treats a missing or incomplete seen file as a baseline and does not re-alert the same deal', () => {
    assert.equal(isBaselineState(null), true);
    assert.equal(isBaselineState(emptySeen()), true);
    assert.equal(isBaselineState({ baselineComplete: false, fingerprints: { existing: { firstSeenAt: '2026-11-01T00:00:00.000Z' } } }), true);
    assert.equal(isBaselineState({ baselineComplete: true, fingerprints: {} }), false);

    const deal = {
      id: 'deal-1',
      title: 'Dell Inspiron 15 -- 16GB!',
      retailer: 'Best Buy',
      glitchPrice: 179,
      originalPrice: 0,
      discountPercent: 0,
      condition: 'New',
      sourceChannel: 'Slickdeals',
      directBuyUrl: 'https://www.bestbuy.com/site/example',
      sourceUrl: 'https://slickdeals.net/f/2',
      isPossiblePriceError: false,
      matchedRules: [],
    } as unknown as GlitchDeal;

    const first = planAlerts(emptySeen(), [deal], 'skipped-baseline');
    assert.equal(first.fresh.length, 1);
    assert.equal(first.seen.baselineComplete, true);
    assert.equal(first.alerts[0].discordStatus, 'skipped-baseline');
    assert.match(first.alerts[0].triggeredAtPT, /PST|PDT/);
    assert.match(first.alerts[0].triggeredAt, /T/);

    const second = planAlerts(first.seen, [deal], 'sent');
    assert.equal(second.fresh.length, 0);
    assert.equal(second.alerts.length, 0);
  });
});

describe('discord message', () => {
  it('includes price, store, condition, rule, link, Pacific time, and the cancellation caution', () => {
    const deal = {
      title: 'Samsung 27" Monitor',
      retailer: 'Best Buy',
      glitchPrice: 89,
      originalPrice: 349,
      discountPercent: 74,
      condition: 'New',
      directBuyUrl: 'https://www.bestbuy.com/site/monitor',
      sourceUrl: 'https://slickdeals.net/f/3',
      matchedRules: [{ ruleId: 'tech-clearance', label: 'Tech & Clearance', reason: '74% off a marked usual price of $349.00' }],
    } as unknown as GlitchDeal;
    const pacific = formatPT(Date.parse('2026-11-13T18:00:00Z'));
    const message = buildDiscordMessage([deal], pacific);
    assert.match(message, /Samsung 27" Monitor/);
    assert.match(message, /Best Buy/);
    assert.match(message, /\$89\.00/);
    assert.match(message, /usual \$349\.00/);
    assert.match(message, /74% off/);
    assert.match(message, /Condition: New/);
    assert.match(message, /Tech & Clearance/);
    assert.match(message, /https:\/\/www\.bestbuy\.com\/site\/monitor/);
    assert.match(message, /Pacific time:/);
    assert.ok(message.includes(pacific));
    assert.ok(message.includes(PRICE_ERROR_DISCORD_CAUTION));
    assert.doesNotMatch(message, /discord(?:app)?\.com\/api\/webhooks/i);
  });
});

describe('secret scrubbing', () => {
  it('removes the live webhook and any webhook-shaped string before output is written', () => {
    const previous = process.env.DISCORD_WEBHOOK_URL;
    const fakeWebhook = ['https://discord.com/api/webhooks', '123456789012345678', 'abcdefghijklmnopqrstuvwxyzABCD'].join('/');
    const otherWebhook = ['https://discord.com/api/webhooks', '999999999999999999', 'abcdefghijKLMNOP'].join('/');
    process.env.DISCORD_WEBHOOK_URL = fakeWebhook;
    try {
      const dirty = {
        note: process.env.DISCORD_WEBHOOK_URL,
        other: otherWebhook,
      };
      const clean = scrubSecrets(dirty);
      assert.equal(containsSecret(clean), false);
      assert.doesNotThrow(() => assertNoSecrets(clean));
      assert.equal(JSON.stringify(clean).includes('123456789012345678'), false);
      assert.equal(JSON.stringify(clean).includes('abcdefghijklmnopqrstuvwxyzABCD'), false);
    } finally {
      if (previous === undefined) delete process.env.DISCORD_WEBHOOK_URL;
      else process.env.DISCORD_WEBHOOK_URL = previous;
    }
  });
});

describe('monitored X accounts', () => {
  it('lists Oscar\'s four deal accounts', () => {
    assert.deepEqual(
      X_DEAL_ACCOUNTS.map((account) => account.uri),
      ['https://x.com/thedealsguy_', 'https://x.com/PayDirtDeals', 'https://x.com/ClearanceCapt', 'https://x.com/dealzbro_']
    );
  });
});

describe('feed normalization', () => {
  it('keeps a legit 55-inch TV markdown and its links-only price checks', () => {
    const { deal, reject } = normalize(
      raw({
        title: 'TCL 55" 4K Roku TV $148.00 (Was $499.00)',
        text: 'TCL 55" 4K Roku TV on sale',
        retailerHint: 'Walmart',
        link: 'https://www.walmart.com/ip/tcl-55',
      }),
      Date.now()
    );
    assert.ok(deal, reject);
    assert.equal(deal?.retailer, 'Walmart');
    assert.equal(deal?.condition, 'Unverified condition');
    assert.ok(deal?.matchedRules?.some((rule) => rule.ruleId === 'tech-clearance'));
    assert.ok(deal?.checkPriceLinks.some((link) => link.label.includes('Google Shopping')));
    assert.ok(deal?.checkPriceLinks.every((link) => /^https:\/\//.test(link.uri)));
  });

  it('rejects medical and tire monitors and keeps a gaming monitor', () => {
    const glucose = normalize(
      raw({
        title: 'Contour Next Glucose Monitor $19.99 (Was $59.99)',
        text: 'diabetic glucometer with lancets',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00EXAMPLE1',
      }),
      Date.now()
    );
    assert.equal(glucose.deal, undefined);
    assert.equal(glucose.reject, 'not tech');

    const tpms = normalize(
      raw({
        title: 'Autel TPMS Tire Pressure Monitor $29.99',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00EXAMPLE2',
      }),
      Date.now()
    );
    assert.equal(tpms.deal, undefined);
    assert.equal(tpms.reject, 'not tech');

    const gaming = normalize(
      raw({
        title: 'Samsung 27" Odyssey G5 Gaming Monitor $89.00 (Was $349.00)',
        text: '1440p 165Hz gaming monitor',
        retailerHint: 'Best Buy',
        link: 'https://www.bestbuy.com/site/samsung-monitor',
      }),
      Date.now()
    );
    assert.ok(gaming.deal, gaming.reject);
    assert.ok(gaming.deal?.matchedRules?.some((rule) => rule.ruleId === 'tech-clearance'));
  });

  it('drops the Switch 2 accessories bundle kit', () => {
    const kit = normalize(
      raw({
        title: 'ivoler Nintendo Switch 2 Accessories Bundle Kit w/ Carrying Case & Charging Dock $13.99',
        text: 'OUKmall-AMUS via Amazon has ivoler Nintendo Switch 2 Accessories Bundle Kit on sale for $13.99',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00EXAMPLE3',
        sourceId: 'sd-popular',
        sourceLabel: 'Slickdeals Popular',
      }),
      Date.now()
    );
    assert.equal(kit.deal, undefined);
    assert.equal(kit.reject, 'accessory under $100');
  });

  it('drops questions and marketplace listings', () => {
    assert.equal(normalize(raw({ title: 'Which laptop should I buy?' }), Date.now()).reject, 'question / discussion post');
    const ebay = normalize(
      raw({
        title: 'TCL 55" 4K TV $99.00',
        retailerHint: 'eBay',
        link: 'https://www.ebay.com/itm/1',
      }),
      Date.now()
    );
    assert.equal(ebay.deal, undefined);
    assert.equal(ebay.reject, 'does not match any watch rule');
  });
});
