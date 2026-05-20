# Contributing

Thanks for helping improve Synthesis. This project welcomes bug reports, feature ideas, documentation fixes, tests, and code contributions.

## Development Setup

Use a local virtual environment unless you specifically prefer Conda:

```bash
npm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
npm run setup:backend
npm start
```

Windows PowerShell:

```powershell
npm install
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
npm run setup:backend
npm start
```

Optional Conda users can create any env name and point Synthesis at it:

```bash
conda create -n synthesis python=3.11 -y
conda activate synthesis
python -m pip install -r python-backend/requirements.txt
SYNTHESIS_CONDA_ENV=synthesis npm start
```

## Before Opening a PR

Run:

```bash
npm run check:js
npm run smoke:backend:quick
```

For backend, model, chart, preprocessing, or packaging changes, also run:

```bash
npm run smoke:backend
```

## Pull Request Guidelines

- Keep changes focused and explain the user-facing behavior being changed.
- Include screenshots or short recordings for UI changes when useful.
- Add or update smoke coverage when changing backend data, chart, or model behavior.
- Do not commit generated installers, build directories, virtual environments, logs, or local `.env` files.
- Keep TypeScript source and generated JavaScript in sync by running `npm run build:ts`.

## Packaging Contributions

Synthesis ships an Electron app plus a Python backend binary. That backend binary must be built on the target OS, so release packaging is handled by `.github/workflows/release.yml`.

Use local package scripts only for the platform you are currently on:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

When changing installer behavior, check the matching GitHub Actions job or test on the matching OS.

## Code Style

- Keep UI changes consistent with the existing Electron renderer structure.
- Keep backend behavior in service modules and expose it through FastAPI only where needed.
- Prefer deterministic samples and fixed random seeds for demos and tests.
- Prefer clear, boring code over clever abstractions.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
