# Forecast Tweaks

A small userscript that adds a few quality-of-life tweaks to [Forecast](https://app.forecast.it) (project management tool):

- **Green rows** for tasks marked `Done`
- **Text wrapping** in columns instead of truncated/cut-off text
- **Select All** button that expands every collapsed group and scrolls through the full task list to select everything, subtasks included

This is not affiliated with Forecast — it just tweaks the page's appearance/behaviour in your own browser.

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Firefox, Edge tested; Safari has a different UI but the same idea).
2. **Chrome/Edge/Brave only — required step:** go to `chrome://extensions`, find Tampermonkey, click **Details**, and turn on **Allow User Scripts**. Without this, Tampermonkey silently does nothing — no error, scripts just never run. (Firefox doesn't need this step.)
3. Click the Tampermonkey icon in your browser toolbar → **Create a new script**.
4. Delete the placeholder content. Open the [raw script file](https://raw.githubusercontent.com/pholbo/forecast-tweaks/main/forecast-tweaks.user.js), select all (`Cmd+A` / `Ctrl+A`), copy, and paste it into the editor. (Use the raw link, not the regular GitHub file view — copying from there can pull in line numbers and formatting.)
5. Save (`Cmd+S` / `Ctrl+S`).
6. Open or refresh [app.forecast.it](https://app.forecast.it) — the tweaks apply automatically.

**Verify it worked:** open any project's task list. Tasks marked `Done` should have a green row background, and a **Select All** button should appear fixed in the bottom-right corner of the page.

**Nothing happening?** Check, in order:
- Step 2 — the most common cause of "installed but nothing changes."
- In the Tampermonkey dashboard, is "Forecast Tweaks" listed and its toggle switched on (enabled)?
- Is the tab actually on `app.forecast.it`? The script only runs on that domain.
- Try a hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`) after installing.

To update later: open Tampermonkey → find "Forecast Tweaks" → edit → replace with the latest version from this repo → save.

## Current status / known limitations

Forecast is a modern web app that changes its internal HTML structure over time, so this script may need occasional updates to keep working. If something stops working, please [open an issue](../../issues) — screenshots help a lot.

- **Select All** scrolls through the whole list to reach every row, so it takes a few seconds on large projects (button shows "Working..." during this) and the page will visibly jump around while it works — that's expected.
- **Text wrapping** works well up to ~3 lines. Beyond that, Forecast's own fixed row height clips further text with no ellipsis (a limitation of overriding a JS-controlled layout with CSS alone). Fine for most task names in practice.

## Contributing

Issues and pull requests welcome. This project is intentionally simple — one script, no build step.

## License

MIT — see [LICENSE](LICENSE).
