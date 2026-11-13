import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCondition,
  evaluateWatchRules,
  fingerprintDeal,
  isLegitRetailer,
  isMajorLegitStore,
  parseTvInches,
  has12GbPlusNvidiaGpu,
  type WatchInput,
} from './watchRules.ts';

const now = Date.parse('2026-11-13T22:00:00-08:00');

function ev(partial: Partial<WatchInput> & Pick<WatchInput, 'title' | 'retailer' | 'price'>) {
  return evaluateWatchRules({
    text: '',
    was: 0,
    discountPercent: 0,
    isPossiblePriceError: false,
    nowMs: now,
    ...partial,
  });
}

function ids(partial: Parameters<typeof ev>[0]) {
  return ev(partial).map((m) => m.ruleId);
}

describe('condition detection', () => {
  it('detects refurbished / open-box / used', () => {
    assert.equal(detectCondition('Dell XPS Refurbished 16GB'), 'Refurbished');
    assert.equal(detectCondition('Open-Box LG C4 55"'), 'Open-Box');
    assert.equal(detectCondition('Used Meta Quest 3'), 'Used');
  });
  it('labels New only when clearly stated, otherwise Unverified', () => {
    assert.equal(detectCondition('Brand new sealed Mac mini M2'), 'New');
    assert.equal(detectCondition('Lenovo Loq 16GB SSD $199 at Best Buy'), 'Unverified condition');
  });
});

describe('retailer filters', () => {
  it('accepts major legit stores and rejects marketplaces', () => {
    assert.equal(isMajorLegitStore('Best Buy'), true);
    assert.equal(isLegitRetailer('Walmart', 'TV sale'), true);
    assert.equal(isLegitRetailer('eBay', 'laptop'), false);
    assert.equal(isLegitRetailer('Amazon', 'GPU sold by CoolSeller123'), false);
    assert.equal(isLegitRetailer('See source', 'TV'), false);
  });
});

describe('TV size parsing and GPU helpers', () => {
  it('parses 55"+ sizes', () => {
    assert.equal(parseTvInches('TCL 55" QLED 4K TV'), 55);
    assert.equal(parseTvInches('65-inch OLED TV'), 65);
  });
  it('requires 12GB for 3060 and 16GB for 4060 Ti; 3080 10GB fails; 3090 and 4070 pass', () => {
    assert.equal(has12GbPlusNvidiaGpu('RTX 3060 12GB').ok, true);
    assert.equal(has12GbPlusNvidiaGpu('RTX 3060 8GB').ok, false);
    assert.equal(has12GbPlusNvidiaGpu('RTX 3080').ok, false);
    assert.equal(has12GbPlusNvidiaGpu('RTX 3080 12GB').ok, true);
    assert.equal(has12GbPlusNvidiaGpu('RTX 3090').ok, true);
    assert.equal(has12GbPlusNvidiaGpu('RTX 4060 Ti 16GB').ok, true);
    assert.equal(has12GbPlusNvidiaGpu('RTX 4060 Ti 8GB').ok, false);
    assert.equal(has12GbPlusNvidiaGpu('RTX 4070 Super').ok, true);
    assert.equal(has12GbPlusNvidiaGpu('RTX 5070').ok, true);
  });
});

describe('Tech & Clearance', () => {
  it('matches a 70%+ off marked usual $100+ price error-class markdown', () => {
    const m = ev({
      title: 'Samsung 27" Monitor $89.00 (Was $349.00)',
      retailer: 'Best Buy',
      price: 89,
      was: 349,
      discountPercent: 74,
    });
    assert.ok(m.some((x) => x.ruleId === 'tech-clearance' && /70%/.test(x.reason)));
  });
  it('matches 60%+ clearance at a major legit store', () => {
    const m = ev({
      title: 'Sony WH-1000XM5 headphones clearance $98 (was $248)',
      retailer: 'Best Buy',
      price: 98,
      was: 248,
      discountPercent: 60,
    });
    assert.ok(m.some((x) => x.ruleId === 'tech-clearance' && /clearance/i.test(x.reason)));
  });
  it('matches 65%+ off other new tech with usual $100+', () => {
    const m = ev({
      title: ' Logitech MX Master 3S $35 (was $100)',
      retailer: 'Adorama',
      price: 35,
      was: 100,
      discountPercent: 65,
    });
    assert.ok(m.some((x) => x.ruleId === 'tech-clearance' && /65%/.test(x.reason)));
  });
  it('matches flat-price tablet, laptop, 55" TV, and any TV <= $100', () => {
    assert.ok(ids({ title: 'Amazon Fire HD 10 Tablet 32GB', retailer: 'Amazon', price: 49.99 }).includes('tech-clearance'));
    assert.ok(ids({ title: 'Lenovo IdeaPad 15.6" Laptop 8GB 256GB SSD', retailer: 'Walmart', price: 149 }).includes('tech-clearance'));
    assert.ok(ids({ title: 'TCL 55" 4K Roku TV', retailer: 'Walmart', price: 148 }).includes('tech-clearance'));
    assert.ok(ids({ title: 'Insignia 32" HD TV', retailer: 'Best Buy', price: 89 }).includes('tech-clearance'));
  });
  it('drops refurbished from Tech & Clearance and drops tablet accessories', () => {
    assert.equal(ids({ title: 'Refurbished Lenovo laptop $129 SSD', retailer: 'Best Buy', price: 129 }).includes('tech-clearance'), false);
    assert.equal(ids({ title: 'iPad 11 screen protector $12', retailer: 'Amazon', price: 12 }).includes('tech-clearance'), false);
  });
  it('matches a clear price error on new tech', () => {
    assert.ok(
      ids({
        title: 'LG C4 65 OLED $199 price error',
        retailer: 'Best Buy',
        price: 199,
        isPossiblePriceError: true,
        priceErrorReason: 'Source text says price error/glitch',
      }).includes('tech-clearance')
    );
  });
  it('rejects eBay / unknown retailers', () => {
    assert.equal(ids({ title: 'TCL 55" 4K TV $99', retailer: 'eBay', price: 99 }).length, 0);
    assert.equal(ids({ title: 'TCL 55" 4K TV $99', retailer: 'See source', price: 99 }).length, 0);
  });
});

describe('Cyber Laptop Watch', () => {
  it('matches a Windows laptop with 16GB RAM + SSD at <= $200, including refurbished', () => {
    const m = ev({
      title: 'Refurbished Dell Inspiron 15 Windows 11 Laptop 16GB RAM 512GB SSD $179',
      retailer: 'Dell',
      price: 179,
    });
    assert.ok(m.some((x) => x.ruleId === 'cyber-laptop' && /Refurbished/.test(x.reason)));
  });
  it('matches upgradeable 8GB RAM', () => {
    assert.ok(
      ids({
        title: 'HP 15 Windows laptop 8GB RAM upgradeable 256GB SSD $199',
        retailer: 'HP',
        price: 199,
      }).includes('cyber-laptop')
    );
  });
  it('rejects Chromebooks, 4GB RAM, missing SSD, and prices over $200', () => {
    assert.equal(ids({ title: 'Acer Chromebook 16GB SSD $99', retailer: 'Best Buy', price: 99 }).includes('cyber-laptop'), false);
    assert.equal(ids({ title: 'Windows laptop 4GB RAM 128GB SSD $150', retailer: 'Walmart', price: 150 }).includes('cyber-laptop'), false);
    assert.equal(ids({ title: 'Windows laptop 16GB RAM 1TB HDD $150', retailer: 'Walmart', price: 150 }).includes('cyber-laptop'), false);
    assert.equal(ids({ title: 'Windows laptop 16GB RAM 512GB SSD $249', retailer: 'Best Buy', price: 249 }).includes('cyber-laptop'), false);
  });
});

describe('Mac mini Watch', () => {
  it('matches M1+ Mac mini <= $300, including refurb', () => {
    assert.ok(ids({ title: 'Refurbished Apple Mac mini M1 256GB $249', retailer: 'Apple', price: 249 }).includes('mac-mini'));
    assert.ok(ids({ title: 'Apple Mac mini M4 16GB $299', retailer: 'Best Buy', price: 299 }).includes('mac-mini'));
  });
  it('rejects Intel Mac mini and prices over $300', () => {
    assert.equal(ids({ title: 'Apple Mac mini Intel i5 $199', retailer: 'Apple', price: 199 }).includes('mac-mini'), false);
    assert.equal(ids({ title: 'Apple Mac mini M2 $349', retailer: 'Best Buy', price: 349 }).includes('mac-mini'), false);
  });
});

describe('Kids Watch', () => {
  it('matches 65%+ off kids/baby items and price errors, and ignores undiscounted toys', () => {
    assert.ok(
      ev({
        title: 'LEGO Friends set $17.50 (was $50.00) girls 7',
        retailer: 'Target',
        price: 17.5,
        was: 50,
        discountPercent: 65,
      }).some((x) => x.ruleId === 'kids')
    );
    assert.ok(
      ids({
        title: 'Graco car seat price mistake $19',
        retailer: "Kohl's",
        price: 19,
        isPossiblePriceError: true,
        priceErrorReason: 'Source says price error',
      }).includes('kids')
    );
    assert.equal(ids({ title: 'LEGO Friends set $49.99', retailer: 'Target', price: 49.99 }).includes('kids'), false);
  });
  it('drops refurbished kids items', () => {
    assert.equal(
      ids({
        title: 'Refurbished kids tablet $20 (was $80)',
        retailer: 'Amazon',
        price: 20,
        was: 80,
        discountPercent: 75,
      }).includes('kids'),
      false
    );
  });
});

describe('Local AI Machine Watch', () => {
  it('matches 12GB+ GPUs <= $200, RTX desktops <= $500, and Apple Silicon 16GB <= $450', () => {
    assert.ok(ids({ title: 'NVIDIA GeForce RTX 3060 12GB Founders $189', retailer: 'Best Buy', price: 189 }).includes('local-ai'));
    assert.ok(
      ids({
        title: 'Open-Box iBUYPOWER Gaming Desktop RTX 4060 8GB 16GB RAM 1TB SSD $479',
        retailer: 'Best Buy',
        price: 479,
      }).includes('local-ai')
    );
    assert.ok(ids({ title: 'Apple MacBook Air M2 16GB RAM 256GB $429', retailer: 'Apple', price: 429 }).includes('local-ai'));
  });
  it('rejects 3060 8GB, Used condition, and over-budget desktops', () => {
    assert.equal(ids({ title: 'RTX 3060 8GB $150', retailer: 'Newegg', price: 150 }).includes('local-ai'), false);
    assert.equal(ids({ title: 'Used RTX 3090 $199', retailer: 'Micro Center', price: 199 }).includes('local-ai'), false);
    assert.equal(
      ids({
        title: 'Gaming Desktop RTX 4070 16GB RAM 1TB SSD $599',
        retailer: 'Best Buy',
        price: 599,
      }).includes('local-ai'),
      false
    );
  });
});

describe('Christmas 2026 Watch', () => {
  it('matches standout Quest and Switch prices and skips baseline promos', () => {
    assert.ok(ids({ title: 'Meta Quest 3S 128GB $249', retailer: 'Best Buy', price: 249 }).includes('christmas-2026'));
    assert.ok(ids({ title: 'Meta Quest 3 512GB $399', retailer: 'Walmart', price: 399 }).includes('christmas-2026'));
    assert.ok(ids({ title: 'Nintendo Switch Lite coral $149', retailer: 'Target', price: 149 }).includes('christmas-2026'));
    assert.ok(ids({ title: 'Nintendo Switch OLED $259', retailer: 'Best Buy', price: 259 }).includes('christmas-2026'));
    assert.ok(ids({ title: 'Nintendo Switch 2 $449', retailer: 'Walmart', price: 449 }).includes('christmas-2026'));
    assert.equal(
      ids({ title: 'Meta Quest 3S 128GB $299 + $50 gift card', retailer: 'Best Buy', price: 299 }).includes('christmas-2026'),
      false
    );
    assert.equal(
      ids({ title: 'Nintendo Switch 2 Mario Kart World Bundle $499.99', retailer: 'Best Buy', price: 499.99 }).includes('christmas-2026'),
      false
    );
  });
  it('drops refurbished Christmas consoles, accessories-only, and post-Christmas dates', () => {
    assert.equal(ids({ title: 'Refurbished Meta Quest 3 $350', retailer: 'Best Buy', price: 350 }).includes('christmas-2026'), false);
    assert.equal(ids({ title: 'Quest 3 carrying case $29', retailer: 'Best Buy', price: 29 }).includes('christmas-2026'), false);
    assert.equal(
      ids({ title: 'Glorious GMMK 2 Prebuilt Linear Switch Gaming Keyboard $48.99', retailer: 'Best Buy', price: 48.99 }).includes('christmas-2026'),
      false
    );
    assert.ok(ids({ title: 'Nintendo Switch (neon) $259', retailer: 'Target', price: 259 }).includes('christmas-2026'));
    assert.equal(
      ev({ title: 'Meta Quest 3S $249', retailer: 'Best Buy', price: 249, nowMs: Date.parse('2026-12-26T08:00:00Z') }).some((x) => x.ruleId === 'christmas-2026'),
      false
    );
  });
  it('matches a clear price error on a 1P console even if the sticker is not below the usual threshold', () => {
    assert.ok(
      ids({
        title: 'Nintendo Switch 2 $199 pricing error',
        retailer: 'Target',
        price: 199,
        isPossiblePriceError: true,
        priceErrorReason: 'Source text says price error',
      }).includes('christmas-2026')
    );
  });
});

describe('fingerprints', () => {
  it('normalizes title/retailer/price so restarts do not re-alert the same deal', () => {
    const a = fingerprintDeal({ title: 'Dell Inspiron 15 -- 16GB!', retailer: 'Best Buy', price: 179 });
    const b = fingerprintDeal({ title: 'Dell Inspiron 15 16GB', retailer: 'best buy', price: 179.0 });
    assert.equal(a, b);
  });
});
