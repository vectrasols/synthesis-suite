// tabs/cleaning.js — Data Cleaning tab
'use strict';

const CleanTab = (() => {
  let _cols = [];
  let _numericCols = [];

  function init() {
    document.getElementById('removeDupBtn')?.addEventListener('click', removeDuplicates);
    document.getElementById('applyCleanBtn')?.addEventListener('click', applyCleaning);
    document.getElementById('exportCleanBtn')?.addEventListener('click', exportCleaned);
    document.getElementById('previewSource')?.addEventListener('change', refreshPreview);
    document.getElementById('outlierThreshold')?.addEventListener('input', e => {
      const v = (parseInt(e.target.value) / 10).toFixed(1);
      document.getElementById('outlierLabel').textContent = `IQR × ${v}`;
    });
  }

  function onDataLoaded(info) {
    _cols = info.columns || [];
    const dtypes = info.dtypes || {};
    _numericCols = _cols.filter(col => /int|float|double|number/.test(String(dtypes[col] || '').toLowerCase()));
    Utils.populateSelect('dtypeCol', _cols, true, 'Select…');
    Utils.populateSelect('encodeCol', _cols, true, 'Select…');
    populateBinarizeSelect();
    Utils.populateSelect('selectionTarget', _cols, true, 'Select…');
    Utils.populateSelect('extractionTarget', _cols, true, 'Optional…');
    appendLog(`✅ Loaded: ${info.source}`, 'ok');
    appendLog(`📊 Shape: ${info.rows} rows × ${info.cols} cols`, 'info');
    refreshPreview();
  }

  function populateBinarizeSelect() {
    const el = document.getElementById('binarizeCol');
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '';
    el.appendChild(new Option('No binarization', ''));
    el.appendChild(new Option('All Numeric Columns', '__all_numeric__'));
    _numericCols.forEach(col => el.appendChild(new Option(col, col)));
    if (cur && (cur === '__all_numeric__' || _numericCols.includes(cur))) el.value = cur;
  }

  function appendLog(msg, type = 'info') {
    const log = document.getElementById('cleanLog');
    if (!log) return;
    const placeholder = log.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();
    const line = document.createElement('div');
    line.className = `log-line-${type}`;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  async function removeDuplicates() {
    Utils.showSpinner('Removing duplicates…');
    try {
      const res = await API.removeDuplicates();
      appendLog(`🗑️ Removed ${res.removed} duplicate rows (${res.rows} remain)`, 'ok');
      refreshPreview();
      Utils.toast(`Removed ${res.removed} duplicates`, 'success');
    } catch (e) {
      appendLog(`❌ Error: ${e.message}`, 'warn');
      Utils.toast(e.message, 'error');
    } finally {
      Utils.hideSpinner();
    }
  }

  async function applyCleaning() {
    Utils.showSpinner('Applying cleaning operations…');
    try {
      const threshold = parseInt(document.getElementById('outlierThreshold')?.value || '15') / 10;
      const params = {
        missing_method: document.getElementById('missingMethod')?.value || 'none',
        remove_outliers: document.getElementById('removeOutliers')?.checked || false,
        outlier_threshold: threshold,
        dtype_column: document.getElementById('dtypeCol')?.value || null,
        dtype_convert: document.getElementById('dtypeConvert')?.value || null,
        scale_method: document.getElementById('scaleMethod')?.value || null,
        binarize_column: document.getElementById('binarizeCol')?.value || null,
        binarize_threshold: parseFloat(document.getElementById('binarizeThreshold')?.value || '0'),
        encode_column: document.getElementById('encodeCol')?.value || null,
        encode_method: document.getElementById('encodeMethod')?.value || null,
        selection_target: document.getElementById('selectionTarget')?.value || null,
        selection_method: document.getElementById('selectionMethod')?.value || null,
        selection_k: parseInt(document.getElementById('selectionK')?.value || '5'),
        extraction_target: document.getElementById('extractionTarget')?.value || null,
        extraction_method: document.getElementById('extractionMethod')?.value || null,
        extraction_components: parseInt(document.getElementById('extractionComponents')?.value || '2'),
      };
      const res = await API.applyCleaning(params);
      res.log.forEach(line => {
        const type = line.startsWith('✅') || line.startsWith('🏷️') ? 'ok' : line.startsWith('🎯') || line.startsWith('🎚️') || line.startsWith('🧬') ? 'info' : 'info';
        appendLog(line, type);
      });
      appendLog(`📐 Result: ${res.rows} rows × ${res.cols} cols`, 'info');
      refreshPreview();
      Utils.toast('Cleaning applied!', 'success');
    } catch (e) {
      appendLog(`❌ Error: ${e.message}`, 'warn');
      Utils.toast(e.message, 'error');
    } finally {
      Utils.hideSpinner();
    }
  }

  async function exportCleaned() {
    const url = API.getExportCleanUrl();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      Utils.downloadBlob(blob, 'cleaned_data.csv');
      Utils.toast('Exported cleaned data!', 'success');
    } catch (e) {
      Utils.toast(`Export failed: ${e.message}`, 'error');
    }
  }

  async function refreshPreview() {
    const cleaned = document.getElementById('previewSource')?.value === 'cleaned';
    try {
      const preview = await API.getPreview(20, cleaned);
      renderTable(preview.columns, preview.rows);
    } catch (e) {
      console.warn('Preview error:', e.message);
    }
  }

  function renderTable(columns, rows) {
    const head = document.getElementById('previewHead');
    const body = document.getElementById('previewBody');
    const ph = document.getElementById('tablePlaceholder');
    if (!head || !body) return;

    if (!columns.length) { if (ph) ph.style.display = ''; return; }
    if (ph) ph.style.display = 'none';

    head.innerHTML = '<tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
    body.innerHTML = rows.map(row =>
      '<tr>' + row.map(v => `<td title="${v}">${v}</td>`).join('') + '</tr>'
    ).join('');
  }

  return { init, onDataLoaded };
})();
