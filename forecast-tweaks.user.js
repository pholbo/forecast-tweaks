// ==UserScript==
// @name         Forecast Tweaks
// @namespace    https://github.com/pholbo/forecast-tweaks
// @version      0.4.0
// @description  Green rows for Done tasks, text wrapping, select-all for app.forecast.it - each feature toggleable via Tampermonkey menu
// @match        https://app.forecast.it/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const DONE_TEXT = 'Done';
  const DONE_BG_COLOR = '#d7f5df';
  const ROW_SELECTOR = '[data-cy="task-row"]';
  const CHECKBOX_SELECTOR = '[data-cy="selector-checkbox"]';

  // ---------- Feature toggles (Tampermonkey menu, on by default) ----------

  const FEATURES = {
    doneRows: { label: 'Green Done rows', default: true },
    textWrap: { label: 'Text wrapping', default: true },
    selectAll: { label: 'Select All button', default: true },
  };

  function isFeatureEnabled(key) {
    return GM_getValue(`feature_${key}`, FEATURES[key].default);
  }

  function toggleFeature(key) {
    GM_setValue(`feature_${key}`, !isFeatureEnabled(key));
    location.reload();
  }

  function registerFeatureMenuCommands() {
    Object.keys(FEATURES).forEach((key) => {
      const mark = isFeatureEnabled(key) ? '✓' : '✗';
      GM_registerMenuCommand(`${mark} ${FEATURES[key].label}`, () => toggleFeature(key));
    });
  }

  // ---------- 1. Green rows for Done tasks ----------

  function styleDoneRows() {
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
      const isDone = Array.from(row.querySelectorAll('[title]')).some(
        (el) => el.title.trim() === DONE_TEXT && el.textContent.trim() === DONE_TEXT
      );
      row.style.backgroundColor = isDone ? DONE_BG_COLOR : '';
    });
  }

  // ---------- 2. Text wrapping instead of truncation ----------

  function injectWrapCSS() {
    if (document.getElementById('forecast-tweaks-wrap-style')) return;
    const style = document.createElement('style');
    style.id = 'forecast-tweaks-wrap-style';
    style.textContent = `
      ${ROW_SELECTOR} [width],
      ${ROW_SELECTOR} [width] * {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
        word-break: break-word;
      }
      ${ROW_SELECTOR} {
        height: auto !important;
        min-height: 100%;
        align-items: flex-start !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- 3. Select all / deselect all, including collapsed groups + offscreen rows ----------

  // Forecast virtualizes the task list (react-virtualized) - rows only exist in the DOM
  // near the current scroll position. This selector finds the actual scrolling element
  // (not the page) so we can force every row to mount by scrolling through it in steps.
  const SCROLL_CONTAINER_SELECTOR = '.ReactVirtualized__Grid.ReactVirtualized__List';

  // A task row's 3rd child div is the expand/collapse toggle. On rows WITH subtasks it
  // carries this extra class; leaf rows (no subtasks) don't have it at all. We deliberately
  // don't key off the state-dependent hash class (e.g. icMlKC vs fukpXZ) since that's a
  // per-build styled-components hash likely to change on any Forecast redeploy - instead
  // we click it and verify the result by checking whether the row count actually grew.
  const EXPAND_TOGGLE_SELECTOR = ':scope > .sc-cbelJu';

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function ensureExpandedByTaskId(taskId) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const idEl = Array.from(document.querySelectorAll('[data-cy="task-id"]')).find(
        (el) => el.textContent.trim() === taskId
      );
      const row = idEl && idEl.closest(ROW_SELECTOR);
      const toggle = row && row.querySelector(EXPAND_TOGGLE_SELECTOR);
      if (!toggle) return;
      const before = document.querySelectorAll(ROW_SELECTOR).length;
      toggle.click();
      await wait(150);
      const after = document.querySelectorAll(ROW_SELECTOR).length;
      if (after > before) return;
    }
  }

  async function expandAllVisibleOnce() {
    const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
    const taskIds = rows
      .filter((row) => row.querySelector(EXPAND_TOGGLE_SELECTOR))
      .map((row) => row.querySelector('[data-cy="task-id"]').textContent.trim());
    for (const taskId of taskIds) {
      await ensureExpandedByTaskId(taskId);
    }
  }

  async function clickMismatchedCheckboxesVisible(targetChecked) {
    for (let pass = 0; pass < 5; pass += 1) {
      const mismatched = Array.from(document.querySelectorAll(CHECKBOX_SELECTOR)).filter(
        (box) => box.checked !== targetChecked
      );
      if (mismatched.length === 0) return;
      mismatched.forEach((box) => box.click());
      await wait(100);
    }
  }

  async function toggleSelectAll() {
    const btn = document.getElementById('forecast-tweaks-select-all-btn');
    const initialBoxes = document.querySelectorAll(CHECKBOX_SELECTOR);
    const targetChecked = Array.from(initialBoxes).some((box) => !box.checked);

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Working...';
    }

    const container = document.querySelector(SCROLL_CONTAINER_SELECTOR);
    if (!container) {
      // Fallback: couldn't find the scroll container, best-effort on visible rows only.
      await expandAllVisibleOnce();
      await clickMismatchedCheckboxesVisible(targetChecked);
    } else {
      const originalScrollTop = container.scrollTop;
      let scrollTop = 0;
      let safety = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        safety += 1;
        container.scrollTop = scrollTop;
        await wait(200);
        await expandAllVisibleOnce();
        await clickMismatchedCheckboxesVisible(targetChecked);
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (scrollTop >= maxScroll || safety > 200) break;
        scrollTop = Math.min(scrollTop + container.clientHeight * 0.7, maxScroll);
      }
      container.scrollTop = originalScrollTop;
      await wait(200);
      await clickMismatchedCheckboxesVisible(targetChecked);
    }

    if (btn) btn.disabled = false;
    injectSelectAllButton();
  }

  function injectSelectAllButton() {
    let btn = document.getElementById('forecast-tweaks-select-all-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'forecast-tweaks-select-all-btn';
      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        padding: '10px 16px',
        background: '#2f6f4f',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      });
      btn.addEventListener('click', toggleSelectAll);
      document.body.appendChild(btn);
    }

    if (btn.disabled) return;
    const boxes = document.querySelectorAll(CHECKBOX_SELECTOR);
    const anyUnchecked = Array.from(boxes).some((box) => !box.checked);
    btn.textContent = boxes.length > 0 && !anyUnchecked ? 'Deselect All' : 'Select All';
  }

  // ---------- Run + keep re-applying as Forecast re-renders rows ----------

  function applyAll() {
    if (isFeatureEnabled('doneRows')) styleDoneRows();
    if (isFeatureEnabled('textWrap')) injectWrapCSS();
    if (isFeatureEnabled('selectAll')) injectSelectAllButton();
  }

  let debounceTimer = null;
  function scheduleApply() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 150);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });

  registerFeatureMenuCommands();
  applyAll();
})();
