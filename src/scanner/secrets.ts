const WEBHOOK_RE = /https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s"'\\]+/i;

export function discordWebhookEnv(): string {
  return process.env.DISCORD_WEBHOOK_URL?.trim() ?? '';
}

/** Replace webhook URLs and the live secret before anything is written or logged. */
export function scrubSecrets<T>(value: T): T {
  const secret = discordWebhookEnv();
  let json = JSON.stringify(value);
  json = json.replace(new RegExp(WEBHOOK_RE.source, 'gi'), '[redacted]');
  if (secret.length >= 8) json = json.split(secret).join('[redacted]');
  return JSON.parse(json) as T;
}

export function containsSecret(value: unknown): boolean {
  const secret = discordWebhookEnv();
  const json = JSON.stringify(value);
  if (WEBHOOK_RE.test(json)) return true;
  if (secret.length >= 8 && json.includes(secret)) return true;
  return false;
}

export function assertNoSecrets(value: unknown): void {
  if (containsSecret(value)) {
    throw new Error('Refusing to write scan output that contains a Discord webhook URL or DISCORD_WEBHOOK_URL');
  }
}

export function safeDiscordError(err: unknown, webhookUrl = ''): string {
  let msg = err instanceof Error ? err.message : String(err ?? 'Discord request failed');
  if (webhookUrl) msg = msg.split(webhookUrl).join('[redacted]');
  msg = msg.replace(new RegExp(WEBHOOK_RE.source, 'gi'), '[redacted]');
  const secret = discordWebhookEnv();
  if (secret.length >= 8) msg = msg.split(secret).join('[redacted]');
  return msg.slice(0, 300);
}
