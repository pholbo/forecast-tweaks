// ==UserScript==
// @name         Forecast Tweaks
// @namespace    https://github.com/pholbo/forecast-tweaks
// @version      0.1.0
// @description  Green rows for Done tasks, text wrapping, select-all for app.forecast.it
// @match        https://app.forecast.it/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DONE_TEXT = 'Done';
  const DONE_BG_COLOR = '#d7f5df';
  const ROW_SELECTOR = '[data-cy="task-row"]';
  const CHECKBOX_SELECTOR = '[data-cy="selector-checkbox"]';

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

  // ---------- 3. Select all (currently visible/expanded rows) ----------

  function selectAllVisible() {
    document.querySelectorAll(CHECKBOX_SELECTOR).forEach((box) => {
      if (!box.checked) box.click();
    });
  }

  function injectSelectAllButton() {
    if (document.getElementById('forecast-tweaks-select-all-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'forecast-tweaks-select-all-btn';
    btn.textContent = 'Select All (visible)';
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
    btn.addEventListener('click', selectAllVisible);
    document.body.appendChild(btn);
  }

  // ---------- Run + keep re-applying as Forecast re-renders rows ----------

  function applyAll() {
    styleDoneRows();
    injectWrapCSS();
    injectSelectAllButton();
  }

  let debounceTimer = null;
  function scheduleApply() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 150);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });

  applyAll();
})();
