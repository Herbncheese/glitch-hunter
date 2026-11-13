# Glitch & Price Error Hunter

Oscar Medina's deal watcher, running with **no AI and no paid APIs**. GitHub Actions reads free RSS and JSON feeds every 5 minutes, applies the six watch rules, and posts genuinely new matches to Discord. GitHub Pages shows the latest results.

The rules in `src/rules/watchRules.ts` are unchanged: Tech & Clearance, Cyber Laptop, Mac mini, Kids, Local AI Machine, and Christmas 2026 (Quest / Switch). Condition is tagged New, Refurbished, Open-Box, Used, or Unverified. Marketplace listings are dropped. Price checks are links only (camelcamelcamel, Keepa, Google Shopping).

## How a scan works

`npm run scan` loads `data/seen-alerts.json` when it exists.

- The first run (no file, or `baselineComplete` is not true) records current matches and writes `discordStatus: "skipped-baseline"`. It does not post that backlog to Discord.
- Later runs post only fingerprints that are not already in `seen-alerts.json`. Delivery is `sent`, `no-webhook`, or `error`.
- One broken feed (timeout, 403, 429) is recorded in `latest-scan.json` and does not fail the scan.
- Timestamps are stored as ISO and as Pacific time (`America/Los_Angeles`, PST or PDT).
- `DISCORD_WEBHOOK_URL` is read from the environment only. It is never written into `data/*.json` or the git history.

State files:

| File | What it holds |
| --- | --- |
| `data/seen-alerts.json` | Baseline flag and deal fingerprints |
| `data/alerts-history.json` | Latest 50 alert rows and Discord delivery |
| `data/latest-scan.json` | Matches, source health, scan time |
| `data/rejections.json` | Filtered posts and the reason each was dropped |

Rapid updates are committed to the **`scanner-data`** branch so `main` does not gain a commit every 5 minutes and Pages does not rebuild on each scan. The page loads

`https://raw.githubusercontent.com/Herbncheese/glitch-hunter/scanner-data/data/<file>.json?t=...`

and falls back to the JSON copied into `dist/data/` at build time. Once a day — and immediately when a new match is alerted — the workflow also commits those JSON files plus `data/activity.json` on `main`, so the default branch stays active and GitHub does not disable the schedule after 60 days of inactivity. Those `data/**` commits do not deploy Pages (`paths-ignore`, and `GITHUB_TOKEN` pushes do not retrigger `on: push`).

## Local commands

```bash
npm ci
npm test
npm run scan          # writes data/*.json; no Discord post unless DISCORD_WEBHOOK_URL is set
npm run dev           # http://localhost:5173
VITE_BASE_PATH=/glitch-hunter/ npm run build
```

## After this is merged

Do these two steps once. Nothing else has to be installed.

1. **GitHub Pages** — Settings → Pages → Build and deployment → Source: **GitHub Actions**. The site is published at `https://herbncheese.github.io/glitch-hunter/`.
2. **Discord** — Settings → Secrets and variables → Actions → New repository secret named `DISCORD_WEBHOOK_URL`. Paste the webhook URL. Do not put it in a file.

The scan workflow (`.github/workflows/scan.yml`) runs every 5 minutes and can be started by hand from the Actions tab. Pull requests run typecheck, tests, and a Pages build without deploying.
