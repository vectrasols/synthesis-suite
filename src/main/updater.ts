// updater.js — Auto-update logic using electron-updater
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');
const log = require('electron-log');
export {};

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Disable auto-install on quit for manual control
autoUpdater.autoInstallOnAppQuit = false;

function setupUpdater(mainWindow) {
  // Forward updater events to renderer
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('Update not available');
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err.message);
    mainWindow.webContents.send('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      speed: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  // Handle install request from renderer
  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates (delay 3 seconds after app loads)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Update check failed (this is normal in dev):', err.message);
    });
  }, 3000);
}

module.exports = { setupUpdater };
