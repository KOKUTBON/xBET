# xBET

A sportsbook and casino platform with live event views, games, and a wallet ledger.

[Open the demo](https://kokutbon.github.io/xBET/) · [Technical documentation](docs/)

## Features

- Browse sports events and build a bet slip.
- Play casino games with a browser-based points wallet.
- Track balances and settlement through double-entry accounting.

## Screenshots

![xBET main workspace](docs/screenshots/sportsbook.png)

![xBET detail view](docs/screenshots/casino-lobby.png)

## Technology

TypeScript, Node.js, PostgreSQL, Redis, Docker.

## Run the demo locally

```sh
git clone https://github.com/KOKUTBON/xBET.git
cd xBET
npm run build:pages
npm run preview:pages
```

Open http://127.0.0.1:4173/xbet/. The browser demo uses sample data. See the technical documentation for the full application setup.

## License

[Apache License 2.0](LICENSE).
