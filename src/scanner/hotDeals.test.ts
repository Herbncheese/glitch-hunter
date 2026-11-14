import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscordMessage } from './discord.ts';
import { normalize, type RawItem } from './engine.ts';
import { dealsForDiscord } from './hotDeals.ts';
import { emptySeen, planAlerts } from './state.ts';
import { formatPT } from './time.ts';

function raw(partial: Partial<RawItem> & Pick<RawItem, 'title'>): RawItem {
  return {
    text: '',
    html: '',
    link: 'https://www.bestbuy.com/site/example',
    sourceUrl: 'https://slickdeals.net/f/1',
    pubMs: Date.now(),
    sourceId: 'sd-tv',
    sourceLabel: 'Slickdeals TV search',
    ...partial,
  };
}

describe('hot deals', () => {
  it('keeps ordinary legit tech that misses the strict watch rules', () => {
    const hisense = normalize(
      raw({
        title: '$199.99 Hisense 55" Class QD5 4K UHD Smart TV at Best Buy',
        retailerHint: 'Best Buy',
        link: 'https://www.bestbuy.com/site/hisense-55',
      }),
      Date.now()
    );
    assert.equal(hisense.deal, undefined);
    assert.equal(hisense.hot?.hotCategory, 'tvs-monitors');
    assert.equal(hisense.hot?.retailer, 'Best Buy');
    assert.equal(hisense.hot?.glitchPrice, 199.99);
    assert.match(hisense.hot?.seenAtPT || '', /PST|PDT/);

    const monitor = normalize(
      raw({
        title: 'Acer Nitro 27" 200Hz Gaming Monitor $149.99',
        retailerHint: 'Best Buy',
      }),
      Date.now()
    );
    assert.equal(monitor.deal, undefined);
    assert.equal(monitor.hot?.hotCategory, 'tvs-monitors');

    const laptop = normalize(
      raw({
        title: 'Lenovo LOQ Essential 15.3" Laptop 16GB RAM 512GB SSD $850',
        retailerHint: 'Lenovo',
        link: 'https://www.lenovo.com/loq',
      }),
      Date.now()
    );
    assert.equal(laptop.deal, undefined);
    assert.equal(laptop.hot?.hotCategory, 'laptops-pcs');

    const openBox = normalize(
      raw({
        title: '[Open-Box] Nothing Headphone Pro $268.99',
        retailerHint: 'Best Buy',
      }),
      Date.now()
    );
    assert.equal(openBox.deal, undefined);
    assert.equal(openBox.hot?.condition, 'Open-Box');
    assert.equal(openBox.hot?.hotCategory, 'audio');
  });

  it('still drops junk, marketplace sellers, and cheap accessories', () => {
    const ebay = normalize(
      raw({
        title: 'Lenovo LOQ laptop 16GB SSD $850',
        retailerHint: 'eBay',
        link: 'https://www.ebay.com/itm/1',
      }),
      Date.now()
    );
    assert.equal(ebay.hot, undefined);
    assert.equal(ebay.deal, undefined);

    const thirdParty = normalize(
      raw({
        title: 'Hisense 55" QD5 4K TV $199.99',
        text: 'OUKmall-AMUS via Amazon',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00HOTTEST1',
      }),
      Date.now()
    );
    assert.equal(thirdParty.hot, undefined);

    const accessory = normalize(
      raw({
        title: 'Nintendo Switch 2 carrying case $13.99',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00HOTTEST2',
      }),
      Date.now()
    );
    assert.equal(accessory.hot, undefined);

    const glucose = normalize(
      raw({
        title: 'Contour Next Glucose Monitor $29.99',
        retailerHint: 'Amazon',
        link: 'https://www.amazon.com/dp/B00HOTTEST3',
      }),
      Date.now()
    );
    assert.equal(glucose.hot, undefined);
    assert.equal(glucose.reject, 'not tech');
  });
});

describe('discord stays on strict matches', () => {
  it('does not fingerprint or alert a hot-only deal', () => {
    const hisense = normalize(
      raw({
        title: '$199.99 Hisense 55" QD5 4K TV at Best Buy',
        retailerHint: 'Best Buy',
        link: 'https://www.bestbuy.com/site/hisense-55',
      }),
      Date.now()
    );
    assert.ok(hisense.hot);
    const strict = dealsForDiscord(hisense.deal ? [hisense.deal] : []);
    assert.equal(strict.length, 0);
    const planned = planAlerts({ ...emptySeen(), baselineComplete: true }, strict, 'sent');
    assert.equal(planned.fresh.length, 0);
    assert.equal(planned.alerts.length, 0);
    assert.equal(Object.keys(planned.seen.fingerprints).length, 0);
    assert.doesNotMatch(buildDiscordMessage(planned.fresh, formatPT()), /Hisense/);
  });

  it('still alerts a strict watch-rule match and ignores a hot deal beside it', () => {
    const strictTv = normalize(
      raw({
        title: 'Insignia 40" HD TV $89.00',
        retailerHint: 'Best Buy',
        link: 'https://www.bestbuy.com/site/insignia-40',
      }),
      Date.now()
    );
    const hotOnly = normalize(
      raw({
        title: 'TCL 55" Q6 QLED TV $279.99',
        retailerHint: 'Best Buy',
        link: 'https://www.bestbuy.com/site/tcl-55',
        sourceId: 'sd-popular',
        sourceLabel: 'Slickdeals Popular',
      }),
      Date.now()
    );
    assert.ok(strictTv.deal?.matchedRules?.some((rule) => rule.ruleId === 'tech-clearance'));
    assert.equal(hotOnly.deal, undefined);
    assert.ok(hotOnly.hot);
    const alertable = dealsForDiscord([...(strictTv.deal ? [strictTv.deal] : []), ...(hotOnly.hot ? [hotOnly.hot] : [])]);
    assert.equal(alertable.length, 1);
    assert.match(alertable[0].title, /Insignia/);
    const planned = planAlerts({ ...emptySeen(), baselineComplete: true }, alertable, 'no-webhook');
    assert.equal(planned.alerts.length, 1);
    assert.equal(planned.alerts[0].discordStatus, 'no-webhook');
    assert.doesNotMatch(planned.alerts[0].title, /TCL/);
    const message = buildDiscordMessage(planned.fresh, formatPT());
    assert.match(message, /Insignia/);
    assert.doesNotMatch(message, /TCL/);
  });
});
