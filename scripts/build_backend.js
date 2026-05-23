#!/usr/bin/env node
'use strict';

const path = require('path');
const { runPython } = require('./run_python');

const args = [
  '-m',
  'PyInstaller',
  '--clean',
  '--onefile',
  '--name',
  'server',
  '--hidden-import',
  'data_service',
  '--hidden-import',
  'chart_service',
  '--hidden-import',
  'ml_service',
  '--distpath',
  path.join('python-backend', 'dist'),
  '--workpath',
  path.join('python-backend', 'build'),
  '--specpath',
  'python-backend',
  path.join('python-backend', 'server.py'),
];

try {
  process.exitCode = runPython(args);
} catch (error) {
  console.error(`[Synthesis Suite] Backend build failed: ${error.message}`);
  process.exitCode = 1;
}
