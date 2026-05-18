// utils.js — Shared utilities
'use strict';
const Utils = (() => {
    function setStatus(msg, isError = false) {
        const el = document.getElementById('statusText');
        if (el) {
            el.textContent = msg;
            el.style.color = isError ? 'var(--danger)' : '';
        }
    }
    function setDataInfo(info) {
        const el = document.getElementById('dataInfo');
        if (el && info)
            el.textContent = `${info.rows.toLocaleString()} rows × ${info.cols} cols`;
        else if (el)
            el.textContent = '';
    }
    function showSpinner(label = 'Processing…') {
        const s = document.getElementById('opSpinner');
        const l = document.getElementById('spinnerLabel');
        if (s) {
            s.classList.remove('hidden');
            if (l)
                l.textContent = label;
        }
    }
    function hideSpinner() {
        const s = document.getElementById('opSpinner');
        if (s)
            s.classList.add('hidden');
    }
    function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
    function hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }
    function toast(msg, type = 'info') {
        const t = document.createElement('div');
        t.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:9999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;
      box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:360px;
      background:${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)'};
      color:#fff;animation:slideUp 0.2s ease;
    `;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }
    function populateSelect(selectId, columns, addEmpty = true, emptyText = 'Select…') {
        const el = document.getElementById(selectId);
        if (!el)
            return;
        const cur = el.value;
        el.innerHTML = '';
        if (addEmpty)
            el.appendChild(new Option(emptyText, ''));
        columns.forEach(c => el.appendChild(new Option(c, c)));
        if (cur && columns.includes(cur))
            el.value = cur;
    }
    function downloadUrl(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    // Download a blob
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        downloadUrl(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { setStatus, setDataInfo, showSpinner, hideSpinner, showModal, hideModal, toast, populateSelect, downloadUrl, downloadBlob };
})();
//# sourceMappingURL=utils.js.map