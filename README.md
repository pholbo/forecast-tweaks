# Forecast Tweaks

A small userscript that adds a few quality-of-life tweaks to [Forecast](https://app.forecast.it) (project management tool):

- **Green rows** for tasks marked `Done`
- **Text wrapping** in columns instead of truncated/cut-off text
- **Select All** button to quickly select visible task rows

This is not affiliated with Forecast — it just tweaks the page's appearance/behaviour in your own browser.

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Firefox, Edge, Safari all supported).
2. Click the Tampermonkey icon in your browser toolbar → **Create a new script**.
3. Delete the placeholder content, and paste in the full contents of [`forecast-tweaks.user.js`](forecast-tweaks.user.js) from this repo.
4. Save (`Cmd+S` / `Ctrl+S`).
5. Open or refresh [app.forecast.it](https://app.forecast.it) — the tweaks apply automatically.

To update later: open Tampermonkey → find "Forecast Tweaks" → edit → replace with the latest version from this repo → save.

## Current status / known limitations

Forecast is a modern web app that changes its internal HTML structure over time, so this script may need occasional updates to keep working. If something stops working, please [open an issue](../../issues) — screenshots help a lot.

- **Select All** currently selects only rows that are already visible/expanded on screen. Selecting subtasks hidden under a collapsed group isn't automated yet — expand groups manually first, then click Select All.
- **Text wrapping** is a first pass. Forecast's row list may not fully resize to fit wrapped text in every column — if you see rows overlapping, let me know via an issue so it can be tuned.

## Contributing

Issues and pull requests welcome. This project is intentionally simple — one script, no build step.

## License

MIT — see [LICENSE](LICENSE).
