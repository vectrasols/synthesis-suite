# Contributing

Thanks for helping improve Synthesis.

## Development Setup

```bash
conda create -n workenv python=3.11 -y
conda activate workenv
python -m pip install -r python-backend/requirements.txt
npm install
```

## Before Opening a PR

Run:

```bash
npm run check:js
npm run smoke:backend:quick
```

For backend, model, chart, or preprocessing changes, also run:

```bash
npm run smoke:backend
```

## Code Style

- Keep UI changes consistent with the existing Electron renderer structure.
- Keep backend behavior in service modules and expose it through FastAPI only where needed.
- Prefer deterministic samples and fixed random seeds for demos and tests.
- Avoid committing generated build outputs, virtual environments, logs, or local configuration.
