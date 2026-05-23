// index.js — Electron main process
// Spawns the Python FastAPI backend, creates the BrowserWindow, handles IPC.
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { setupUpdater } = require('./updater');
const { applyPendingPayloadUpdate, getActiveBackendDir, getActiveRendererRoot, setupPayloadUpdater, } = require('./payload-updater');
// ─── Globals ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let pythonProcess = null;
let backendPort = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const projectRoot = path.join(__dirname, '..');
// ─── Find a free port ─────────────────────────────────────────────────────────
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}
function getPythonPathsFromEnvRoot(envRoot) {
    if (!envRoot)
        return null;
    return process.platform === 'win32'
        ? [path.join(envRoot, 'Scripts', 'python.exe'), path.join(envRoot, 'python.exe')]
        : [path.join(envRoot, 'bin', 'python')];
}
function commandWorks(command) {
    try {
        execFileSync(command, ['--version'], { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
function findPythonInEnvRoot(envRoot) {
    for (const pythonPath of getPythonPathsFromEnvRoot(envRoot) || []) {
        if (fs.existsSync(pythonPath) && commandWorks(pythonPath)) {
            return pythonPath;
        }
    }
    return null;
}
function findCondaEnvRoot(envName) {
    try {
        const raw = execFileSync('conda', ['info', '--envs', '--json'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const info = JSON.parse(raw);
        return (info.envs || []).find(envPath => path.basename(envPath) === envName) || null;
    }
    catch {
        return null;
    }
}
function resolveDevPython() {
    const explicitPython = process.env.SYNTHESIS_PYTHON;
    if (explicitPython) {
        if (fs.existsSync(explicitPython) || commandWorks(explicitPython)) {
            return explicitPython;
        }
        throw new Error(`SYNTHESIS_PYTHON does not point to a runnable Python: ${explicitPython}`);
    }
    const envRoots = [
        process.env.SYNTHESIS_VENV,
        path.join(projectRoot, '.venv'),
        process.env.VIRTUAL_ENV,
        process.env.CONDA_PREFIX,
    ];
    for (const envRoot of envRoots) {
        const pythonPath = findPythonInEnvRoot(envRoot);
        if (pythonPath)
            return pythonPath;
    }
    const requestedCondaEnv = process.env.SYNTHESIS_CONDA_ENV;
    if (requestedCondaEnv) {
        const condaPython = findPythonInEnvRoot(findCondaEnvRoot(requestedCondaEnv));
        if (condaPython)
            return condaPython;
    }
    const candidates = process.platform === 'win32' ? ['python'] : ['python3', 'python'];
    for (const candidate of candidates) {
        if (commandWorks(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Python 3 was not found. Create .venv, activate a virtual environment, ` +
        `or set SYNTHESIS_PYTHON to a Python executable.`);
}
// ─── Spawn Python backend ─────────────────────────────────────────────────────
async function startPythonBackend() {
    backendPort = await getFreePort();
    console.log(`[Synthesis Suite] Starting Python backend on port ${backendPort}`);
    let pythonExe, serverScript;
    if (isDev) {
        // Development: prefer project/local Python environments, with Conda still optional.
        pythonExe = resolveDevPython();
        serverScript = path.join(__dirname, '..', 'python-backend', 'server.py');
    }
    else {
        // Production: use the bundled backend binary built on the target OS.
        const resourcePath = process.resourcesPath;
        const binaryName = process.platform === 'win32' ? 'server.exe' : 'server';
        const activeBackendDir = getActiveBackendDir();
        serverScript = path.join(activeBackendDir || path.join(resourcePath, 'python-backend'), binaryName);
        pythonExe = null; // We'll run the binary directly
    }
    const args = ['--port', String(backendPort)];
    if (!isDev && !fs.existsSync(serverScript)) {
        throw new Error(`Bundled backend executable not found: ${serverScript}`);
    }
    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env },
        windowsHide: true,
    };
    const startupOutput = [];
    const recordStartupOutput = (label, data) => {
        const text = data.toString().trim();
        if (!text)
            return text;
        startupOutput.push(`[${label}] ${text}`);
        while (startupOutput.length > 30)
            startupOutput.shift();
        return text;
    };
    if (pythonExe) {
        console.log(`[Synthesis Suite] Python executable: ${pythonExe}`);
        pythonProcess = spawn(pythonExe, [serverScript, ...args], spawnOptions);
    }
    else {
        console.log(`[Synthesis Suite] Backend executable: ${serverScript}`);
        pythonProcess = spawn(serverScript, args, spawnOptions);
    }
    pythonProcess.stdout?.on('data', (d) => {
        const text = recordStartupOutput('stdout', d);
        if (text)
            console.log('[Python]', text);
    });
    pythonProcess.stderr?.on('data', (d) => {
        const text = recordStartupOutput('stderr', d);
        if (text)
            console.error('[Python ERR]', text);
    });
    pythonProcess.on('exit', (code) => console.log(`[Python] exited with code ${code}`));
    // Wait until server is ready
    await waitForServer(backendPort, isDev ? 30000 : 120000, pythonProcess, () => startupOutput.join('\n'));
    console.log(`[Synthesis Suite] Backend ready on port ${backendPort}`);
}
// Poll /api/health until server responds
function formatStartupOutput(getStartupOutput) {
    const output = getStartupOutput?.();
    return output ? `\n\nBackend output:\n${output}` : '';
}
function waitForServer(port, timeoutMs, backendProcess = null, getStartupOutput = null) {
    const http = require('http');
    const startTime = Date.now();
    let settled = false;
    let retryTimer = null;
    return new Promise((resolve, reject) => {
        function cleanup() {
            if (retryTimer)
                clearTimeout(retryTimer);
            backendProcess?.off('exit', onExit);
            backendProcess?.off('error', onError);
        }
        function finish(error = null) {
            if (settled)
                return;
            settled = true;
            cleanup();
            if (error)
                reject(error);
            else
                resolve();
        }
        function fail(message) {
            finish(new Error(`${message}${formatStartupOutput(getStartupOutput)}`));
        }
        function onExit(code, signal) {
            const detail = signal ? `signal ${signal}` : `code ${code}`;
            fail(`Python backend exited before it was ready (${detail})`);
        }
        function onError(error) {
            fail(`Could not launch Python backend: ${error.message}`);
        }
        function scheduleCheck() {
            if (settled || retryTimer)
                return;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                check();
            }, 300);
        }
        function check() {
            if (settled)
                return;
            if (Date.now() - startTime > timeoutMs) {
                fail(`Python backend did not start in time after ${Math.round(timeoutMs / 1000)} seconds`);
                return;
            }
            let retried = false;
            const retryOnce = () => {
                if (retried)
                    return;
                retried = true;
                scheduleCheck();
            };
            const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
                res.resume();
                if (res.statusCode === 200)
                    finish();
                else
                    retryOnce();
            });
            req.on('error', retryOnce);
            req.setTimeout(1000, () => {
                req.destroy();
                retryOnce();
            });
        }
        backendProcess?.once('exit', onExit);
        backendProcess?.once('error', onError);
        check();
    });
}
// ─── Create Window ────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1500,
        height: 920,
        minWidth: 1120,
        minHeight: 720,
        backgroundColor: '#1e1e23',
        show: false,
        title: 'Synthesis Suite - Data Analysis Suite',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    });
    // Load the active renderer payload, falling back to the bundled renderer.
    const activeRendererRoot = !isDev ? getActiveRendererRoot() : null;
    const rendererRoot = activeRendererRoot || path.join(__dirname, '..');
    mainWindow.loadFile(path.join(rendererRoot, 'renderer', 'index.html'));
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
        if (isDev)
            mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    // Setup auto-updater
    if (!isDev) {
        try {
            setupUpdater(mainWindow);
        }
        catch (e) {
            console.warn('Updater setup skipped:', e.message);
        }
        try {
            setupPayloadUpdater(mainWindow);
        }
        catch (e) {
            console.warn('Payload updater setup skipped:', e.message);
        }
    }
}
// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    if (!fs.existsSync(iconPath))
        return;
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Synthesis Suite');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Synthesis Suite', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}
// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function registerIpcHandlers() {
    // Provide backend port to renderer
    ipcMain.handle('get-backend-port', () => backendPort);
    // App version
    ipcMain.handle('get-version', () => app.getVersion());
    // Open file dialog
    ipcMain.handle('open-file', async (_, filters = []) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: filters.length ? filters : [
                { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'json', 'tsv', 'parquet'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return result.canceled ? null : result.filePaths[0];
    });
    // Save file dialog
    ipcMain.handle('save-file', async (_, defaultName = 'file', filters = []) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultName,
            filters: filters.length ? filters : [
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return result.canceled ? null : result.filePath;
    });
    // Read file from disk as base64
    ipcMain.handle('read-file', async (_, filePath) => {
        return fs.readFileSync(filePath);
    });
    // Read text from the system clipboard
    ipcMain.handle('read-clipboard-text', async () => {
        return clipboard.readText();
    });
    // Write bytes to disk
    ipcMain.handle('write-file', async (_, filePath, data) => {
        fs.writeFileSync(filePath, Buffer.from(data));
        return true;
    });
}
// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    registerIpcHandlers();
    Menu.setApplicationMenu(null);
    if (!isDev) {
        try {
            await applyPendingPayloadUpdate();
        }
        catch (err) {
            console.error('Failed to apply pending payload update:', err.message);
        }
    }
    try {
        await startPythonBackend();
    }
    catch (err) {
        console.error('Failed to start Python backend:', err.message);
        dialog.showErrorBox('Startup Error', `Could not start the Python backend:\n${err.message}`);
        app.quit();
        return;
    }
    createWindow();
    createTray();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('before-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
    }
});
// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}
else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
}
//# sourceMappingURL=index.js.map
