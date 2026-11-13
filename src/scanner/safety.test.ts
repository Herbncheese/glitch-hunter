import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const FILES = ['seen-alerts.json', 'alerts-history.json', 'latest-scan.json', 'rejections.json'];

describe('committed scan data', () => {
  it('exists, parses, uses Pacific timestamps, and contains no webhook or credential', () => {
    const dir = path.resolve('data');
    for (const name of FILES) {
      const file = path.join(dir, name);
      assert.equal(fs.existsSync(file), true, `${name} is missing. Run npm run scan to seed data/.`);
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /discord(?:app)?\.com\/api\/webhooks\/\d+/i, name);
      assert.doesNotMatch(text, /DISCORD_WEBHOOK_URL/, name);
      assert.doesNotMatch(text, /X_BEARER_TOKEN|ALERT_ADMIN_KEY|GEMINI_API_KEY|OPENAI_API_KEY/i, name);
      JSON.parse(text);
    }

    const latest = JSON.parse(fs.readFileSync(path.join(dir, 'latest-scan.json'), 'utf8'));
    assert.match(latest.scannedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(latest.scannedAtPT, /\b(?:PST|PDT)\b/);
    assert.equal(typeof latest.discordConfigured, 'boolean');
    assert.ok(['sent', 'no-webhook', 'error', 'skipped-baseline', 'none'].includes(latest.discordDelivery));

    const seen = JSON.parse(fs.readFileSync(path.join(dir, 'seen-alerts.json'), 'utf8'));
    assert.equal(typeof seen.baselineComplete, 'boolean');
    assert.equal(typeof seen.fingerprints, 'object');

    const history = JSON.parse(fs.readFileSync(path.join(dir, 'alerts-history.json'), 'utf8'));
    assert.ok(Array.isArray(history));
    for (const row of history) {
      assert.match(row.triggeredAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(row.triggeredAtPT, /\b(?:PST|PDT)\b/);
      assert.ok(['sent', 'no-webhook', 'error', 'skipped-baseline'].includes(row.discordStatus));
    }
  });
});
