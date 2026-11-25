import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectCondition } from '../rules/watchRules.ts';
import { scanFreshness, STALE_AFTER_MS } from './freshness.ts';
import { normalize, type RawItem } from './engine.ts';
import { parseWootOfferHtml, topicsFromForumSearch } from './wootOffers.ts';

const OFFER_HTML = `<html><head><title>Lenovo ThinkPad T14 (Refurbished) - Sold out</title></head>
<body>
<script>var offerTitle = "Lenovo ThinkPad T14 (Refurbished)";</script>
<div class="price-exact">
  <span class="price">$149.00</span>
  <span class="list-price">$899.00</span>
</div>
</body></html>`;

describe('Woot and Sellout offer parsing', () => {
  it('reads forum topics and skips rows without a slug', () => {
    const topics = topicsFromForumSearch(
      {
        topics: [
          { title: 'HP EliteBook', slug: 'hp-elitebook', created_at: '2026-11-25T01:00:00.000Z' },
          { title: 'missing slug', created_at: '2026-11-25T01:00:00.000Z' },
          { title: 'HP EliteBook', slug: 'hp-elitebook', created_at: '2026-11-25T01:00:00.000Z' },
          { title: 'Next', slug: 'next-item', created_at: '2026-11-25T01:00:01.000Z' },
        ],
      },
      5
    );
    assert.deepEqual(
      topics.map((topic) => topic.slug),
      ['hp-elitebook', 'next-item']
    );
  });

  it('reads the offer price and does not treat a refurbished title as New', () => {
    const parsed = parseWootOfferHtml(OFFER_HTML);
    assert.ok(parsed);
    assert.equal(parsed?.sale, 149);
    assert.equal(parsed?.list, 899);
    assert.equal(parsed?.soldOut, true);
    assert.equal(detectCondition('Lenovo ThinkPad T14', parsed?.conditionText), 'Refurbished');
    assert.notEqual(detectCondition('Lenovo ThinkPad T14', ''), 'New');
  });
});

describe('Sellout items do not become false strict alerts', () => {
  it('does not match a cheap game or a switch accessory', () => {
    const game = normalize(sellout('Nintendo Switch game $9.99'), Date.now());
    assert.equal(game.deal, undefined);
    assert.equal(game.hot, undefined);

    const accessory = normalize(sellout('Nintendo Switch 2 carrying case $13.99'), Date.now());
    assert.equal(accessory.deal, undefined);
    assert.equal(accessory.hot, undefined);
  });

  it('keeps a refurbished Sellout laptop out of the new-tech rule', () => {
    const laptop = normalize(
      sellout('Lenovo ThinkPad T14 16GB RAM 512GB SSD $149.00', 'Lenovo ThinkPad T14 (Refurbished)'),
      Date.now()
    );
    const rules = laptop.deal?.matchedRules || laptop.hot?.matchedRules || [];
    assert.equal(rules.some((rule) => rule.ruleId === 'tech-clearance'), false);
    assert.equal(laptop.deal?.condition || laptop.hot?.condition, 'Refurbished');
    assert.notEqual(laptop.deal?.condition, 'New');
  });
});

describe('published scan freshness', () => {
  it('marks a multi-hour-old scan stale and a fresh one current', () => {
    const now = Date.parse('2026-11-25T01:18:00Z');
    const old = scanFreshness('2026-11-24T20:22:22.311Z', now);
    assert.equal(old.stale, true);
    assert.ok((old.ageMs || 0) > STALE_AFTER_MS);
    assert.match(old.ageLabel, /h/);
    const fresh = scanFreshness(new Date(now - 2 * 60_000).toISOString(), now);
    assert.equal(fresh.stale, false);
  });
});

function sellout(title: string, text = ''): RawItem {
  return {
    title,
    text,
    html: '',
    link: 'https://sellout.woot.com/offers/example',
    sourceUrl: 'https://sellout.woot.com/offers/example',
    pubMs: Date.now(),
    sourceId: 'sellout',
    sourceLabel: 'Sellout',
    retailerHint: 'Sellout',
  };
}
