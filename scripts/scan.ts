import { runScanAndPersist } from '../src/scanner/run.ts';

runScanAndPersist()
  .then((summary) => {
    if (summary.baseline) {
      console.log('Baseline saved. Later runs alert only on matches that are not in seen-alerts.json.');
    }
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message.replace(/https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi, '[redacted]'));
    process.exit(1);
  });
