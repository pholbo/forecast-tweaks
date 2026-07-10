// ==UserScript==
// @name         Forecast Tweaks
// @namespace    https://github.com/pholbo/forecast-tweaks
// @version      0.6.0
// @description  Colour-code rows by Forecast status (colours/statuses user-configurable), text wrapping, select-all for app.forecast.it - configured via a single Tampermonkey settings panel
// @match        https://app.forecast.it/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const ROW_SELECTOR = '[data-cy="task-row"]';
  const CHECKBOX_SELECTOR = '[data-cy="selector-checkbox"]';

  // Built-in defaults (see issue #3). Users can override colours, add their own
  // statuses, and toggle colouring per-status via the settings panel (issue #11) -
  // these stay as the fallback for any status the user hasn't customised.
  const STATUS_COLORS = {
    Backlog: '#e0e0e0',
    'Spec refinement': '#cfe2ff',
    'To-do': '#e3f2fd',
    'In progress': '#ffe8b3',
    'PR Review': '#e6d7f5',
    'Deployment ready': '#c2f0e8',
    Done: '#d7f5df',
    Archived: '#c7c7c7',
  };

  // ---------- Status colour overrides (user-configurable, see issue #11) ----------

  const STATUS_OVERRIDES_KEY = 'statusColorOverrides';

  function getStatusOverrides() {
    return JSON.parse(GM_getValue(STATUS_OVERRIDES_KEY, '{}'));
  }

  // Merges user overrides (colour and/or enabled changes to a default status, plus
  // wholly custom statuses) on top of STATUS_COLORS. Only *changed* statuses are
  // ever stored in the override blob (see the settings panel's Save handler), so a
  // status the user never touched keeps tracking the built-in default even if that
  // default changes in a later version of the script.
  function getEffectiveStatuses() {
    const overrides = getStatusOverrides();
    const result = {};
    Object.entries(STATUS_COLORS).forEach(([status, color]) => {
      result[status] = overrides[status]
        ? { color: overrides[status].color, enabled: overrides[status].enabled }
        : { color, enabled: true };
    });
    Object.entries(overrides).forEach(([status, cfg]) => {
      if (!result[status]) result[status] = cfg;
    });
    return result;
  }

  // ---------- Feature toggles (configured via the settings panel, on by default) ----------

  const FEATURES = {
    statusColors: { label: 'Status colours', default: true },
    statusColorsSelectorOnly: { label: 'Status colours: selector only (not full row)', default: false },
    textWrap: { label: 'Text wrapping', default: true },
    selectAll: { label: 'Select All button', default: true },
  };

  function isFeatureEnabled(key) {
    return GM_getValue(`feature_${key}`, FEATURES[key].default);
  }

  // ---------- 1. Colour-code rows by Forecast status ----------

  // The status selector renders its current value as an element whose title and
  // text content both equal the status name (this is how the prior Done-only
  // logic found it too) - find that element and look up its colour.
  function findStatusElement(row, effectiveStatuses) {
    return Array.from(row.querySelectorAll('[title]')).find(
      (el) => el.title.trim() === el.textContent.trim() && effectiveStatuses.hasOwnProperty(el.title.trim())
    );
  }

  // Forecast re-applies its own inline style on hover (a plain style.property
  // write, which fully replaces any prior value we set - !important on our
  // side doesn't survive that because it's not a cascade, it's a straight
  // overwrite). So instead of writing background-color directly, we mark the
  // element with a data attribute and let an injected stylesheet rule (below)
  // own the actual colour - a stylesheet !important rule reliably beats a
  // plain inline write, since that's a real cascade comparison.
  const STATUS_ATTR = 'data-forecast-tweaks-status';

  function injectStatusColorCSS(effectiveStatuses) {
    let style = document.getElementById('forecast-tweaks-status-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'forecast-tweaks-status-style';
      document.head.appendChild(style);
    }
    style.textContent = Object.entries(effectiveStatuses)
      .filter(([, cfg]) => cfg.enabled)
      .map(([status, cfg]) => `[${STATUS_ATTR}="${status}"] { background-color: ${cfg.color} !important; }`)
      .join('\n');
  }

  function setStatusAttr(el, status) {
    if (status) {
      if (el.getAttribute(STATUS_ATTR) !== status) el.setAttribute(STATUS_ATTR, status);
    } else if (el.hasAttribute(STATUS_ATTR)) {
      el.removeAttribute(STATUS_ATTR);
    }
  }

  // The badge we detect status from (title === text content) sits inside a
  // wrapper Forecast swaps out for an editable dropdown on hover, which wipes
  // any marker we put on the badge itself. Colour that stable wrapper instead
  // - it's the anchor for the whole dropdown and survives the hover swap.
  const STATUS_WRAPPER_SELECTOR = '[data-cy="task-status"]';

  function styleStatusColors() {
    const effectiveStatuses = getEffectiveStatuses();
    injectStatusColorCSS(effectiveStatuses);
    const selectorOnly = isFeatureEnabled('statusColorsSelectorOnly');
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
      const statusEl = findStatusElement(row, effectiveStatuses);
      const status = statusEl ? statusEl.title.trim() : undefined;
      // Parent tasks (with subtasks) show status as plain read-only text with
      // no dropdown wrapper at all - fall back to colouring the badge itself
      // rather than leaving them uncoloured in selector-only mode.
      const wrapperEl = statusEl && (statusEl.closest(STATUS_WRAPPER_SELECTOR) || statusEl);
      // Rows are recycled by Forecast's virtualized list, so always set both
      // targets (even to undefined) rather than only the active mode's target.
      setStatusAttr(row, !selectorOnly && status ? status : undefined);
      if (wrapperEl) setStatusAttr(wrapperEl, selectorOnly && status ? status : undefined);
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

  // ---------- 4. Unified settings panel (features + status colours, issue #11) ----------

  function buildFeatureRow(key) {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' });
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isFeatureEnabled(key);
    checkbox.dataset.featureKey = key;
    row.appendChild(checkbox);
    row.appendChild(document.createTextNode(FEATURES[key].label));
    return row;
  }

  function buildStatusRow(status, cfg, isCustom) {
    const row = document.createElement('div');
    row.dataset.status = status;
    row.dataset.custom = isCustom ? '1' : '';
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = cfg.enabled;
    checkbox.className = 'forecast-tweaks-status-enabled';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = cfg.color;
    colorInput.className = 'forecast-tweaks-status-color';

    const label = document.createElement('span');
    label.textContent = status;
    Object.assign(label.style, { flexGrow: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

    row.appendChild(checkbox);
    row.appendChild(colorInput);
    row.appendChild(label);

    if (isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      Object.assign(removeBtn.style, { fontSize: '12px', cursor: 'pointer' });
      removeBtn.addEventListener('click', () => row.remove());
      row.appendChild(removeBtn);
    }

    return row;
  }

  function openSettingsPanel() {
    if (document.getElementById('forecast-tweaks-settings-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'forecast-tweaks-settings-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#fff',
      color: '#1a1a1a',
      width: '420px',
      maxHeight: '80vh',
      overflowY: 'auto',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      fontFamily: 'sans-serif',
      fontSize: '14px',
    });
    overlay.appendChild(panel);

    const title = document.createElement('h2');
    title.textContent = 'Forecast Tweaks settings';
    Object.assign(title.style, { margin: '0 0 12px', fontSize: '16px' });
    panel.appendChild(title);

    const featuresHeading = document.createElement('h3');
    featuresHeading.textContent = 'Features';
    Object.assign(featuresHeading.style, { margin: '12px 0 4px', fontSize: '13px' });
    panel.appendChild(featuresHeading);

    Object.keys(FEATURES).forEach((key) => panel.appendChild(buildFeatureRow(key)));

    const statusHeading = document.createElement('h3');
    statusHeading.textContent = 'Status colours';
    Object.assign(statusHeading.style, { margin: '16px 0 4px', fontSize: '13px' });
    panel.appendChild(statusHeading);

    const statusRows = document.createElement('div');
    statusRows.id = 'forecast-tweaks-status-rows';
    Object.entries(getEffectiveStatuses()).forEach(([status, cfg]) => {
      statusRows.appendChild(buildStatusRow(status, cfg, !STATUS_COLORS.hasOwnProperty(status)));
    });
    panel.appendChild(statusRows);

    const addRow = document.createElement('div');
    Object.assign(addRow.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' });
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'New status name';
    Object.assign(nameInput.style, { flexGrow: '1', minWidth: '0' });
    const newColorInput = document.createElement('input');
    newColorInput.type = 'color';
    newColorInput.value = '#cccccc';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const exists = Array.from(statusRows.children).some((row) => row.dataset.status === name);
      if (exists) {
        alert(`"${name}" is already in the list.`);
        return;
      }
      statusRows.appendChild(buildStatusRow(name, { color: newColorInput.value, enabled: true }, true));
      nameInput.value = '';
    });
    addRow.appendChild(nameInput);
    addRow.appendChild(newColorInput);
    addRow.appendChild(addBtn);
    panel.appendChild(addRow);

    const buttonRow = document.createElement('div');
    Object.assign(buttonRow.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset to defaults';
    Object.assign(resetBtn.style, { marginRight: 'auto', cursor: 'pointer' });
    resetBtn.addEventListener('click', () => {
      Object.keys(FEATURES).forEach((key) => GM_setValue(`feature_${key}`, FEATURES[key].default));
      GM_setValue(STATUS_OVERRIDES_KEY, '{}');
      location.reload();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, { cursor: 'pointer' });
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    Object.assign(saveBtn.style, {
      background: '#2f6f4f',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      padding: '6px 14px',
      cursor: 'pointer',
    });
    saveBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[data-feature-key]').forEach((checkbox) => {
        GM_setValue(`feature_${checkbox.dataset.featureKey}`, checkbox.checked);
      });

      const overrides = {};
      Array.from(statusRows.children).forEach((row) => {
        const status = row.dataset.status;
        const enabled = row.querySelector('.forecast-tweaks-status-enabled').checked;
        const color = row.querySelector('.forecast-tweaks-status-color').value;
        const isCustom = row.dataset.custom === '1';
        const matchesDefault = !isCustom && STATUS_COLORS[status] === color && enabled === true;
        if (!matchesDefault) overrides[status] = { color, enabled };
      });
      GM_setValue(STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
      location.reload();
    });

    buttonRow.appendChild(resetBtn);
    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(saveBtn);
    panel.appendChild(buttonRow);

    document.body.appendChild(overlay);
  }

  // ---------- Run + keep re-applying as Forecast re-renders rows ----------

  function applyAll() {
    if (isFeatureEnabled('statusColors')) styleStatusColors();
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

  // Safety net: the status cell's hover interaction appears to swap its own
  // DOM node in/out (not just its style), and that transition doesn't always
  // land within our mutation-triggered debounce window - some rows are left
  // unstyled until something else happens to trigger a mutation. A cheap
  // periodic re-apply self-heals that within ~1s regardless of the exact cause.
  setInterval(applyAll, 1000);

  GM_registerMenuCommand('⚙ Forecast Tweaks settings...', openSettingsPanel);
  applyAll();
})();
