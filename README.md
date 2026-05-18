# Synthesis

Synthesis is a desktop data analysis and machine-learning workbench built with Electron, Plotly, FastAPI, pandas, and scikit-learn.

It supports local file import, manual/paste/URL data loading, data cleaning, interactive visualization, preprocessing, feature engineering, model training, and runnable algorithm demos.

## Highlights

- CSV, Excel, JSON, TSV, Parquet, URL, clipboard, manual, and sample dataset import
- Interactive 2D and 3D Plotly charts with export support
- Missing-value handling, outlier removal, dtype conversion, scaling, binarization, encoding, feature selection, and feature extraction
- Supervised, unsupervised, semi-supervised, anomaly-detection, ensemble, and reinforcement-learning demos
- Local Python backend spawned by Electron
- Conda-first development workflow using the `workenv` environment

## Local Development

From this directory:

```bash
conda create -n workenv python=3.11 -y
conda activate workenv
python -m pip install -r python-backend/requirements.txt

npm install
npm start
```

Electron resolves the Python backend in this order:

1. `SYNTHESIS_PYTHON`, if it points to an existing Python executable
2. Conda env named by `SYNTHESIS_CONDA_ENV`, defaulting to `workenv`
3. The active `CONDA_PREFIX`
4. System Python only when `SYNTHESIS_ALLOW_SYSTEM_PYTHON=1`

To be explicit:

```bash
SYNTHESIS_CONDA_ENV=workenv npm start
```

## Verification

Run the backend smoke suite:

```bash
npm run smoke:backend
```

Run a faster smoke suite:

```bash
npm run smoke:backend:quick
```

Check TypeScript and generated JavaScript syntax:

```bash
npm run check:js
```

## Packaging

The Electron shell is configured with `electron-builder`:

```bash
npm run pack
npm run build:linux
```

Production builds run `npm run build:backend` first, which uses PyInstaller from Conda `workenv` and places the backend executable in `python-backend/dist/`. For development, no bundled binary is needed because Electron starts the backend with Conda Python.

## Project Structure

- `main/` - Electron main process, preload bridge, updater setup
- `src/` - TypeScript source for Electron and renderer logic
- `renderer/` - HTML/CSS and generated JavaScript desktop UI
- `python-backend/` - FastAPI backend and data/ML/chart services
- `scripts/` - development and verification scripts
- `assets/` - app icons and build resources

## License

MIT. See [LICENSE](LICENSE).
