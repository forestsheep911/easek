# Easek

Easek is a Tampermonkey userscript project based on Vite, TypeScript, pnpm, and a localhost live reload loader.

## How It Works

Development uses two local pieces:

- Vite dev server serves a Tampermonkey loader at `http://127.0.0.1:8864/dev/<name>.loader.user.js`.
- Vite watch build writes the real userscript bundle to `dist/dev/<name>.script.js`.

The installed loader runs on the target site, downloads the latest local bundle with `GM_xmlhttpRequest`, executes it in the userscript context, and checks a local version endpoint once per second. When the bundle changes, the target page reloads once.

This is live reload, not module-level HMR. It avoids Tampermonkey local file access and keeps the development path close to how userscripts actually run.

## Setup

```bash
pnpm install
```

Update project metadata before starting a real script:

- `package.json`: `name`, `version`, `description`, `author`, repository fields.
- `config/common.meta.js`: production userscript metadata such as `match`, `grant`, `connect`, `run-at`.
- `config/dev.meta.js`: development-only metadata, usually target `match`, localhost `connect`, and loader grants.

## Development

```bash
pnpm dev
```

Open the dev loader in a browser and install it in Tampermonkey:

```text
http://127.0.0.1:8864/dev/easek.loader.user.js
```

Then open the target page matched by `config/dev.meta.js`. When source files change, Vite rebuilds the local bundle and the target page reloads automatically.

For the local sandbox page only:

```bash
pnpm start
```

## Build

```bash
pnpm build
```

Production output is written to:

```text
dist/store/<name>.user.js
```

## Scripts

- `pnpm dev`: run the dev server and watch-build the local userscript bundle.
- `pnpm start`: run only the Vite sandbox server.
- `pnpm build:dev`: build the development bundle once.
- `pnpm build`: lint and build the production `.user.js`.
- `pnpm typecheck`: run TypeScript without emitting files.
- `pnpm lint`: run ESLint on `src`.
