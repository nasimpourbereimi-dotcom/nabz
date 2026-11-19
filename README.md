# نبض (Nabz)

A personal, offline-first PWA that turns Apple Watch / Apple Health data into calm, actionable training insights.
Persian UI (RTL, Jalali). All data stays on the phone (IndexedDB); there is no backend.

- Architecture and decisions: [`CLAUDE.md`](CLAUDE.md)
- Product strategy: [`docs/product.md`](docs/product.md)
- Shortcuts design: [`docs/shortcuts.md`](docs/shortcuts.md)
- Approved mockups: [`docs/mockups/`](docs/mockups/index.html)

## Develop

```bash
npm install
npm run dev            # local dev server
npm test               # unit tests
npm run build          # production build (BASE=/repo/ for GitHub Pages)
npm run gen:export -- 365 scripts/out/export.zip   # synthetic Health export for testing
```
