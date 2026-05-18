// tabs/visualization.js — Visualization tab logic
'use strict';
const VizTab = (() => {
    let _dataInfo = null;
    let _manualGrid = null;
    function init() {
        // File loading
        document.getElementById('loadFileBtn')?.addEventListener('click', openFile);
        document.getElementById('pasteBtn')?.addEventListener('click', importFromClipboard);
        document.getElementById('manualBtn')?.addEventListener('click', () => Utils.showModal('manualModal'));
        document.getElementById('urlBtn')?.addEventListener('click', () => Utils.showModal('urlModal'));
        document.getElementById('sampleBtn')?.addEventListener('click', () => Utils.showModal('sampleModal'));
        // Drop zone
        const dz = document.getElementById('dropZone');
        if (dz) {
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
            dz.addEventListener('drop', e => {
                e.preventDefault();
                dz.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file)
                    loadFile(file);
            });
            dz.addEventListener('click', openFile);
        }
        // Chart controls — all update chart on change
        ['xCol', 'yCol', 'zCol', 'chartType', 'chartTitle', 'useHue', 'showStats'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', Charts.refreshChart);
        });
        ['chartBins', 'chartOpacity'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', Charts.refreshChart);
        });
        document.getElementById('chartTitle')?.addEventListener('input', Charts.refreshChart);
        // Filtering
        document.getElementById('filterCol')?.addEventListener('change', onFilterColChange);
        document.getElementById('filterPick')?.addEventListener('change', e => {
            if (e.target.value)
                document.getElementById('filterValue').value = e.target.value;
        });
        document.getElementById('applyFilterBtn')?.addEventListener('click', applyFilter);
        document.getElementById('clearFilterBtn')?.addEventListener('click', clearFilters);
        // Export
        document.getElementById('exportChartBtn')?.addEventListener('click', exportChart);
        // URL modal
        document.getElementById('urlLoadBtn')?.addEventListener('click', loadFromUrl);
        document.getElementById('urlCancelBtn')?.addEventListener('click', () => Utils.hideModal('urlModal'));
        // Sample modal
        document.getElementById('sampleLoadBtn')?.addEventListener('click', loadSample);
        document.getElementById('sampleCancelBtn')?.addEventListener('click', () => Utils.hideModal('sampleModal'));
        // Paste modal
        document.getElementById('pasteLoadBtn')?.addEventListener('click', loadFromPaste);
        document.getElementById('pasteCancelBtn')?.addEventListener('click', () => Utils.hideModal('pasteModal'));
        // Manual modal
        document.getElementById('createManualTableBtn')?.addEventListener('click', createManualTable);
        document.getElementById('parseManualBtn')?.addEventListener('click', parseManualText);
        document.getElementById('manualLoadBtn')?.addEventListener('click', loadManualData);
        document.getElementById('manualCancelBtn')?.addEventListener('click', () => Utils.hideModal('manualModal'));
    }
    async function importFromClipboard() {
        try {
            const text = window.electronAPI?.readClipboardText ? await window.electronAPI.readClipboardText() : '';
            if (!text || !text.trim()) {
                Utils.showModal('pasteModal');
                return;
            }
            Utils.showSpinner('Importing clipboard data…');
            const info = await API.loadText(text, 'Clipboard Data');
            onDataLoaded(info);
        }
        catch (e) {
            Utils.showModal('pasteModal');
            Utils.toast(`Clipboard import unavailable: ${e.message}`, 'error');
        }
        finally {
            Utils.hideSpinner();
        }
    }
    async function openFile() {
        if (window.electronAPI) {
            const fp = await window.electronAPI.openFile();
            if (!fp)
                return;
            const buf = await window.electronAPI.readFile(fp);
            const fname = fp.split(/[\\/]/).pop();
            const file = new File([buf], fname);
            loadFile(file);
        }
        else {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.csv,.xlsx,.xls,.json,.tsv,.parquet';
            inp.onchange = () => { if (inp.files[0])
                loadFile(inp.files[0]); };
            inp.click();
        }
    }
    async function loadFile(file) {
        Utils.showSpinner(`Loading ${file.name}…`);
        Utils.setStatus(`Loading ${file.name}…`);
        try {
            const info = await API.uploadFile(file);
            onDataLoaded(info);
        }
        catch (e) {
            Utils.toast(`Failed to load file: ${e.message}`, 'error');
            Utils.setStatus(`Error: ${e.message}`, true);
        }
        finally {
            Utils.hideSpinner();
        }
    }
    async function loadFromUrl() {
        const url = document.getElementById('urlInput').value.trim();
        const fmt = document.getElementById('urlFormat').value;
        if (!url)
            return Utils.toast('Enter a URL', 'error');
        Utils.hideModal('urlModal');
        Utils.showSpinner('Fetching from URL…');
        try {
            const info = await API.loadUrl(url, fmt);
            onDataLoaded(info);
        }
        catch (e) {
            Utils.toast(`URL load failed: ${e.message}`, 'error');
        }
        finally {
            Utils.hideSpinner();
        }
    }
    async function loadSample() {
        const choice = document.getElementById('sampleSelect').value;
        Utils.hideModal('sampleModal');
        Utils.showSpinner('Loading sample data…');
        try {
            const info = await API.loadSample(choice);
            onDataLoaded(info);
        }
        catch (e) {
            Utils.toast(`Sample load failed: ${e.message}`, 'error');
        }
        finally {
            Utils.hideSpinner();
        }
    }
    async function loadFromPaste() {
        const text = document.getElementById('pasteText').value.trim();
        if (!text)
            return Utils.toast('No data pasted', 'error');
        Utils.hideModal('pasteModal');
        Utils.showSpinner('Parsing data…');
        try {
            const info = await API.loadText(text, 'Clipboard Data');
            onDataLoaded(info);
        }
        catch (e) {
            Utils.toast(`Parse failed: ${e.message}`, 'error');
        }
        finally {
            Utils.hideSpinner();
        }
    }
    let _manualParsed = null;
    function parseManualText() {
        const text = document.getElementById('manualText').value.trim();
        if (!text)
            return;
        const sep = text.includes('\t') ? '\t' : ',';
        const result = Papa.parse(text, { header: true, delimiter: sep, skipEmptyLines: true });
        if (!result.data.length)
            return;
        _manualParsed = result.data;
        const headers = Object.keys(result.data[0]);
        const rows = result.data.map(row => headers.map(header => row[header] ?? ''));
        renderManualGrid(headers, rows);
    }
    function createManualTable() {
        const rows = Math.max(1, parseInt(document.getElementById('manualRows')?.value || '5', 10));
        const cols = Math.max(1, parseInt(document.getElementById('manualCols')?.value || '3', 10));
        const headers = Array.from({ length: cols }, (_, i) => `Column_${i + 1}`);
        const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
        renderManualGrid(headers, data);
    }
    function renderManualGrid(headers, rows) {
        const wrap = document.getElementById('manualGridWrap');
        if (!wrap)
            return;
        wrap.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'data-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headers.forEach((header, index) => {
            const th = document.createElement('th');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'input';
            input.value = header;
            input.dataset.col = String(index);
            th.appendChild(input);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            headers.forEach((_, colIndex) => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'input';
                input.value = row?.[colIndex] ?? '';
                input.dataset.row = String(rowIndex);
                input.dataset.col = String(colIndex);
                td.appendChild(input);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        _manualGrid = table;
    }
    function serializeManualGrid() {
        if (!_manualGrid)
            return '';
        const headerInputs = _manualGrid.querySelectorAll('thead input');
        const bodyRows = Array.from(_manualGrid.querySelectorAll('tbody tr'));
        const headers = Array.from(headerInputs).map(input => input.value.trim() || 'Column');
        const rows = bodyRows.map(tr => Array.from(tr.querySelectorAll('input')).map(input => input.value.trim()));
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
    async function loadManualData() {
        const gridText = serializeManualGrid().trim();
        const text = gridText || document.getElementById('manualText').value.trim();
        if (!text)
            return Utils.toast('Enter some data first', 'error');
        Utils.hideModal('manualModal');
        Utils.showSpinner('Loading data…');
        try {
            const info = await API.loadText(text, 'Manual Entry');
            onDataLoaded(info);
        }
        catch (e) {
            Utils.toast(`Failed: ${e.message}`, 'error');
        }
        finally {
            Utils.hideSpinner();
        }
    }
    function onDataLoaded(info) {
        _dataInfo = info;
        const cols = info.columns || [];
        // Update file display
        document.getElementById('dropZone')?.classList.add('hidden');
        const fi = document.getElementById('fileInfo');
        if (fi)
            fi.classList.remove('hidden');
        const fn = document.getElementById('fileName');
        if (fn)
            fn.textContent = `📄 ${info.source}`;
        const fm = document.getElementById('fileMeta');
        if (fm)
            fm.textContent = `${info.rows.toLocaleString()} rows × ${info.cols} cols`;
        Utils.populateSelect('xCol', cols);
        Utils.populateSelect('yCol', cols);
        Utils.populateSelect('zCol', cols, true, 'Select Z…');
        Utils.populateSelect('filterCol', cols, true, 'Select column…');
        Utils.setDataInfo(info);
        Utils.setStatus(`Loaded: ${info.source}`);
        // Notify other tabs
        CleanTab?.onDataLoaded(info);
        ModelTab?.onDataLoaded(info);
        Charts.refreshChart();
    }
    async function onFilterColChange() {
        const col = document.getElementById('filterCol').value;
        if (!col)
            return;
        const res = await API.getColumnValues(col).catch(() => ({ values: [] }));
        const pick = document.getElementById('filterPick');
        if (pick) {
            pick.innerHTML = '<option value="">Pick value…</option>';
            res.values.forEach(v => pick.appendChild(new Option(v, v)));
        }
    }
    async function applyFilter() {
        const col = document.getElementById('filterCol').value;
        const cond = document.getElementById('filterCond').value;
        const value = document.getElementById('filterValue').value.trim() ||
            document.getElementById('filterPick').value;
        if (!col || !value)
            return Utils.toast('Select column and value', 'error');
        try {
            const res = await API.applyFilter(col, cond, value);
            Utils.setStatus(`Filter applied: ${res.filter_desc} (${res.filtered_rows} rows)`);
            renderFilterChips(res.active_filters);
            Charts.refreshChart();
        }
        catch (e) {
            Utils.toast(`Filter error: ${e.message}`, 'error');
        }
    }
    async function clearFilters() {
        await API.clearFilters();
        document.getElementById('filterChips').innerHTML = '';
        document.getElementById('filterValue').value = '';
        Utils.setStatus('Filters cleared');
        Charts.refreshChart();
    }
    function renderFilterChips(filters) {
        const el = document.getElementById('filterChips');
        if (!el)
            return;
        el.innerHTML = Object.entries(filters).map(([col, desc]) => `<div class="filter-chip"><span>${desc}</span><button type="button" data-clear-filter="${col}" title="Remove">×</button></div>`).join('');
        el.querySelectorAll('button[data-clear-filter]').forEach(button => {
            button.addEventListener('click', clearFilters);
        });
    }
    async function exportChart() {
        const div = document.getElementById('chartDiv');
        if (!div || !div.data)
            return Utils.toast('No chart to export', 'error');
        try {
            const savePath = window.electronAPI?.saveFile
                ? await window.electronAPI.saveFile('chart.png', [
                    { name: 'PNG Files', extensions: ['png'] },
                    { name: 'SVG Files', extensions: ['svg'] },
                ])
                : null;
            if (!savePath) {
                const url = await Plotly.toImage(div, { format: 'png', scale: 2, width: 1400, height: 900 });
                const a = document.createElement('a');
                a.href = url;
                a.download = 'chart.png';
                a.click();
                Utils.toast('Chart exported!', 'success');
                return;
            }
            const ext = (savePath.split('.').pop() || 'png').toLowerCase();
            const format = ext === 'svg' ? 'svg' : 'png';
            const dataUrl = await Plotly.toImage(div, { format, scale: 2, width: 1400, height: 900 });
            const blob = await (await fetch(dataUrl)).blob();
            const bytes = await blob.arrayBuffer();
            await window.electronAPI.writeFile(savePath, bytes);
            Utils.toast('Chart exported!', 'success');
        }
        catch (e) {
            Utils.toast(`Export failed: ${e.message}`, 'error');
        }
    }
    return { init, onDataLoaded };
})();
//# sourceMappingURL=visualization.js.map