# Static GitHub Pages demo

A standalone, browser-only build of the existing frontend. It needs no database, API server,
WebSocket service, credentials or payment provider. Building and previewing it never publishes anything.

## Build and preview

Use Node.js 24 (the bundler uses Node's TypeScript stripping). No `npm install` is needed for these commands:

```sh
npm run test:demo
npm run build:pages
npm run preview:pages
```

Open <http://127.0.0.1:4173/xbet/>. If that port is busy, use
`XBET_DEMO_PORT=4178 npm run preview:pages` and open <http://127.0.0.1:4178/xbet/>.
The preview mounts the site at `/xbet/` on purpose, to catch project-path mistakes.

The upload-ready site is `dist/pages/` (generated, ignored by Git): about 23 files / ~520 KB.
All asset URLs are relative, so it works under any repository name or at a root domain.
The build:

- injects `window.XBET_STATIC_DEMO = true` into `index.html` (the normal `build:web` output is untouched);
- stamps a content hash on `app.bundle.js`/`main.css` and the service-worker cache name, so a new deploy
  never serves a stale bundle to returning visitors;
- adds SEO/social meta tags, a `<noscript>` notice, `404.html` and `.nojekyll`;
- fails if an expected `index.html` snippet is missing or if any unexpected file lands in the output.

Set `XBET_SITE_URL` (the workflow does this automatically) to add absolute `canonical`/`og:url`/`og:image` links.

## What the demo simulates

**Sportsbook** (`apps/web/src/demo/demo-sports.ts`)

- ~38 events across 7 sports and 20 competitions: soccer (10 leagues), tennis (ATP/WTA), basketball
  (NBA, EuroLeague), ice hockey (NHL, SHL), American football (NFL, NCAAF), baseball (MLB) and handball (EHF).
  Around 20 are live at any moment; the rest are upcoming with kick-off countdowns.
- Each sport has its own match model: minute-by-minute soccer with possession, shots, corners and cards
  (red cards change scoring rates), hockey/handball periods, basketball quarters and overtime, NFL
  touchdowns/field goals, baseball half-innings with extra innings, and tennis games, breaks, sets and tie-breaks.
- 3–8 markets per event, ~200 in total: 1X2, double chance, moneyline, totals (several lines), Asian handicap /
  spreads / puck and run lines, both teams to score, set betting and correct score.
- Prices are Monte-Carlo estimates from the current match state with a 4.5–18% bookmaker margin. They drift
  while the game runs, suspend briefly after goals and scores, and lock once an outcome is impossible.
- The match centre shows implied probabilities, live stats, a score-by-period table and an event timeline.
- Matches run accelerated (a soccer match takes roughly 4 minutes at 1×). Finished events show the result for
  30 seconds and are replaced by new fixtures, so the board never runs dry.

**Bets and wallet** (`apps/web/src/demo/demo-state.ts`)

- A sample player starts with 5,000 points. No sign-in, e-mail or password.
- Singles, multiple singles (stake per selection) and combis up to 12 legs (one selection per match).
- Tickets lock the displayed prices and **settle when their simulated match finishes**, graded against the
  actual simulated result. A combi loses as soon as one leg loses. Payouts happen exactly once.
- Cash out is offered on open tickets (locked odds vs current odds, minus 3%) and is suspended while a market is.
- Simulation controls: pause/resume, 1× / 2× / 4× speed, and **Play my matches to full time** to settle instantly.
- The wallet shows net result, open stakes, sports and casino P/L, a balance chart and a filterable ledger with a
  running balance. You can add demo points or reset everything.
- Balance, tickets, ledger and the board are saved in `localStorage` per site path. When you come back later the
  elapsed time is replayed, so open bets settle and new events are on the board. Blocked or full storage falls back
  to memory for the session.

**Casino & virtuals** (`apps/web/src/demo/demo-casino.ts`) — 12 titles with realistic long-run returns
(checked by `test:demo`): European roulette (97.3%), blackjack with automated basic strategy, baccarat with
third-card rules and tie push, high-low, three 5-reel/5-line slots (~95%), Lucky 80 keno, 75-ball bingo,
scratch cards, and virtual greyhound and horse racing with form, ratings and win/place prices.

Not included in the static build: live-dealer studio, third-party provider games, account management,
the cashier/voucher backend and the trader console.

Browser outcomes use `Math.random` for presentation only; they are not provably fair or server-verified, and
balances can be edited with browser dev tools. There is no server-side ledger or account security. The
service-backed frontend remains available through `npm run build:web` and the normal platform start commands.

## Tests

`npm run test:demo` (about 10 s, no network) covers: every sport simulating to a valid final with exactly one
winner per market, deterministic replays and margins, outcome rules, a 30-minute board soak, single/combi/multiple
single settlement without double payment, rejection of same-match combis, overdrafts and suspended markets,
cash out, persistence with catch-up after the tab was closed, casino return ranges and game rules, and that no
API request is ever made.

## Publish later, when ready

No deployment has been run as part of preparing this demo. The workflow
`.github/workflows/pages-demo.yml` has only a manual `workflow_dispatch` trigger, so a push or pull request
never publishes it.

When you decide to publish:

1. Commit and push the source changes to the GitHub repository you want to host.
2. In that repository, choose **Settings → Pages → Build and deployment → Source → GitHub Actions**.
   (Do this first: the workflow's `configure-pages` step fails if Pages is not enabled.)
3. Open **Actions → Publish static demo (manual only) → Run workflow** and choose the branch.
4. The workflow runs `test:demo`, builds `dist/pages` with the Pages URL for social links, uploads only those
   static files, and deploys through the `github-pages` environment. The run summary shows the site URL.

The organization project URL after publication and Pages activation is `https://kokutbon.github.io/xBET/`. This is a configured target, not a live published site. Keep deployment manual and activate Pages only after the owner chooses publication.

GitHub's workflow setup is documented in
[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
