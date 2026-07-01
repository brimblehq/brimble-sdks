# Brimble SDKs

Public SDK repository for Brimble Sandbox.

## Packages

- `sandbox` - TypeScript SDK (`@brimble/sandbox`)
- `sandbox-python` - Python SDK (`brimble-sandbox`)
- `sandbox-go` - Go SDK (`github.com/brimblehq/brimble-sdks/sandbox-go`)

## Release

### Go + Python (one command)

From the repo root:

```bash
export PYPI_TOKEN=...   # PyPI API token with upload scope
chmod +x scripts/publish-go-python.sh
./scripts/publish-go-python.sh 0.1.4
```

This script will:

1. Bump `sandbox-go/constants.go` and `sandbox-python/pyproject.toml` to the given version
2. Run `go test` and Python unit tests
3. Commit the version bump
4. Build and upload `brimble-sandbox` to PyPI via `twine`
5. Create and push the `sandbox-go/v0.1.4` git tag (Go module release)

Useful flags:

```bash
./scripts/publish-go-python.sh 0.1.4 --dry-run      # preview only
./scripts/publish-go-python.sh 0.1.4 --skip-push      # tag locally, no git push
./scripts/publish-go-python.sh 0.1.4 --skip-python    # Go tag only
./scripts/publish-go-python.sh 0.1.4 --skip-go        # PyPI only
./scripts/publish-go-python.sh 0.1.4 --no-commit      # do not auto-commit version files
```

Go consumers install with:

```bash
go get github.com/brimblehq/brimble-sdks/sandbox-go@v0.1.4
```

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
