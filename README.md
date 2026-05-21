# Brimble SDKs

Public SDK repository for Brimble Sandbox.

## Packages

- `sandbox` - TypeScript SDK (`@brimble/sandbox`)
- `sandbox-python` - Python SDK (`brimble-sandbox`)
- `sandbox-go` - Go SDK (`github.com/brimblehq/brimble-sdks/sandbox-go`)

## Release

### TypeScript

```bash
cd sandbox
yarn build
yarn publish
```

### Python

```bash
cd sandbox-python
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e '.[dev]' build twine
python -m pytest -q
python -m build
python -m twine check dist/*
python -m twine upload dist/*
```

### Go

```bash
cd sandbox-go
go test ./...
go build ./...
```

Then tag from repo root, for example:

```bash
git tag sandbox-go/v0.1.0
git push origin sandbox-go/v0.1.0
```
