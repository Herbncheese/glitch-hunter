const PT = 'America/Los_Angeles';

/** User-facing timestamp in Pacific Time (PST or PDT). */
export function formatPT(ms: number | Date = Date.now()): string {
  const date = ms instanceof Date ? ms : new Date(ms);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PT,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
