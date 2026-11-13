import { PRICE_ERROR_DISCORD_CAUTION } from '../rules/watchRules.ts';
import type { GlitchDeal } from '../types/deals.ts';
import { discordWebhookEnv, safeDiscordError } from './secrets.ts';

const WEBHOOK_SHAPE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+$/;

export type WebhookEnvState = 'missing' | 'invalid' | 'ok';

export function webhookEnvState(): WebhookEnvState {
  const url = discordWebhookEnv();
  if (!url) return 'missing';
  if (!WEBHOOK_SHAPE.test(url)) return 'invalid';
  return 'ok';
}

export function buildDiscordMessage(deals: GlitchDeal[], pacificTimestamp: string): string {
  const lines: string[] = [
    `**[GlitchHunter — ${deals.length} new match${deals.length === 1 ? '' : 'es'}]**`,
    `Pacific time: ${pacificTimestamp}`,
  ];
  const shown = deals.slice(0, 8);
  for (const deal of shown) {
    const condition = deal.condition || 'Unverified condition';
    const labels = (deal.matchedRules || []).map((rule) => rule.label).join(', ') || 'Watch';
    const reasons = (deal.matchedRules || [])
      .map((rule) => rule.reason)
      .filter(Boolean)
      .join('; ');
    const price = Number(deal.glitchPrice).toFixed(2);
    const hasWas = deal.discountPercent > 0 && deal.originalPrice > 0;
    const priceLine = hasWas
      ? `**$${price}** vs usual $${Number(deal.originalPrice).toFixed(2)} (${deal.discountPercent}% off)`
      : `**$${price}** (usual price not posted)`;
    lines.push('');
    lines.push(`• **${deal.title}**`);
    lines.push(`  Store: ${deal.retailer}`);
    lines.push(`  ${priceLine}`);
    lines.push(`  Condition: ${condition}`);
    lines.push(`  Matched rule: ${labels}${reasons ? ` — ${reasons}` : ''}`);
    lines.push(`  ${deal.directBuyUrl || deal.sourceUrl}`);
  }
  if (deals.length > shown.length) {
    lines.push('');
    lines.push(`+ ${deals.length - shown.length} more matches are on the GlitchHunter page.`);
  }
  lines.push('');
  lines.push(PRICE_ERROR_DISCORD_CAUTION);
  return lines.join('\n').slice(0, 1900);
}

export async function postDiscord(webhookUrl: string, content: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'GlitchHunter', content }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(safeDiscordError(err, webhookUrl));
  }
  if (!response.ok) {
    throw new Error(`Discord returned HTTP ${response.status}`);
  }
}
