#!/usr/bin/env bash
# Publish sandbox-go (git tag) and brimble-sandbox (PyPI) in one shot.
#
# Usage:
#   ./scripts/publish-go-python.sh 0.1.4
#   ./scripts/publish-go-python.sh 0.1.4 --dry-run
#
# Environment:
#   PYPI_TOKEN          PyPI API token (required unless --dry-run or --skip-python)
#   TWINE_USERNAME      Defaults to __token__ when PYPI_TOKEN is set
#
# Go consumers install with:
#   go get github.com/brimblehq/brimble-sdks/sandbox-go@v0.1.4
#
# Python consumers install with:
#   pip install brimble-sandbox==0.1.4

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_DIR="$ROOT/sandbox-go"
PYTHON_DIR="$ROOT/sandbox-python"
GO_CONSTANTS="$GO_DIR/constants.go"
PYTHON_PYPROJECT="$PYTHON_DIR/pyproject.toml"
GO_MODULE="github.com/brimblehq/brimble-sdks/sandbox-go"

DRY_RUN=false
SKIP_TESTS=false
SKIP_PYTHON=false
SKIP_GO=false
SKIP_PUSH=false
NO_COMMIT=false
VERSION=""

usage() {
  sed -n '2,16p' "$0"
  echo ""
  echo "Options:"
  echo "  --dry-run       Print actions without uploading, tagging, or pushing"
  echo "  --skip-tests    Skip go test and pytest"
  echo "  --skip-python   Skip PyPI upload"
  echo "  --skip-go       Skip git tag + push for Go"
  echo "  --skip-push     Create tag locally but do not push to origin"
  echo "  --no-commit     Do not auto-commit version file changes"
  echo "  -h, --help      Show this help"
}

log() {
  printf '==> %s\n' "$*"
}

run() {
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

semver_ok() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]
}

set_version_files() {
  local version="$1"

  log "Setting version to $version"

  if [[ "$DRY_RUN" == true ]]; then
    log "Would update $GO_CONSTANTS and $PYTHON_PYPROJECT"
    return 0
  fi

  python3 - "$version" "$GO_CONSTANTS" "$PYTHON_PYPROJECT" <<'PY'
import re
import sys

version, go_path, py_path = sys.argv[1:]

go_text = open(go_path, encoding="utf-8").read()
go_text, go_count = re.subn(
    r'(SDKPackageVersion\s*=\s*)"[^"]+"',
    rf'\1"{version}"',
    go_text,
    count=1,
)
if go_count != 1:
    raise SystemExit(f"failed to update SDKPackageVersion in {go_path}")

py_text = open(py_path, encoding="utf-8").read()
py_text, py_count = re.subn(
    r'(?m)^version = "[^"]+"',
    f'version = "{version}"',
    py_text,
    count=1,
)
if py_count != 1:
    raise SystemExit(f"failed to update version in {py_path}")

open(go_path, "w", encoding="utf-8").write(go_text)
open(py_path, "w", encoding="utf-8").write(py_text)
PY
}

ensure_python_tooling() {
  local venv="$PYTHON_DIR/.venv"
  local pip

  if [[ ! -d "$venv" ]]; then
    log "Creating Python venv at sandbox-python/.venv"
    run python3 -m venv "$venv"
  fi

  pip="$venv/bin/pip"
  run "$pip" install -U pip setuptools wheel build twine pytest >/dev/null
  run "$pip" install -e "$PYTHON_DIR[dev]" >/dev/null
  echo "$venv/bin/python"
}

run_go_tests() {
  log "Running Go tests"
  (cd "$GO_DIR" && go test ./...)
}

run_python_tests() {
  local python_bin="$1"
  log "Running Python unit tests"
  (cd "$PYTHON_DIR" && "$python_bin" -m pytest tests/unit -q)
}

publish_python() {
  local python_bin="$1"
  local version="$2"

  if [[ "$DRY_RUN" == false && -z "${PYPI_TOKEN:-}" ]]; then
    echo "error: PYPI_TOKEN is required to upload to PyPI (or use --skip-python / --dry-run)" >&2
    exit 1
  fi

  log "Building Python package"
  run rm -rf "$PYTHON_DIR/dist"
  run "$python_bin" -m build "$PYTHON_DIR"

  log "Checking Python distribution"
  run "$python_bin" -m twine check "$PYTHON_DIR/dist"/*

  if [[ "$DRY_RUN" == true ]]; then
  log "Would upload: $PYTHON_DIR/dist/*"
    return 0
  fi

  log "Uploading brimble-sandbox $version to PyPI"
  TWINE_USERNAME="${TWINE_USERNAME:-__token__}" \
  TWINE_PASSWORD="${PYPI_TOKEN}" \
  "$python_bin" -m twine upload "$PYTHON_DIR/dist"/*
}

publish_go_tag() {
  local version="$1"
  local tag="sandbox-go/v${version}"

  if git -C "$ROOT" rev-parse "$tag" >/dev/null 2>&1; then
    echo "error: git tag already exists: $tag" >&2
    exit 1
  fi

  log "Creating Go release tag $tag"
  run git -C "$ROOT" tag -a "$tag" -m "Release sandbox-go v${version}"

  if [[ "$SKIP_PUSH" == true ]]; then
    log "Skipping git push (--skip-push)"
    return 0
  fi

  log "Pushing commits and tag to origin"
  run git -C "$ROOT" push origin HEAD
  run git -C "$ROOT" push origin "$tag"
}

commit_version_bump() {
  local version="$1"

  if [[ "$NO_COMMIT" == true ]]; then
    log "Skipping version commit (--no-commit)"
    return 0
  fi

  if [[ -z "$(git -C "$ROOT" status --porcelain -- "$GO_CONSTANTS" "$PYTHON_PYPROJECT")" ]]; then
    log "No version file changes to commit"
    return 0
  fi

  log "Committing version bump"
  run git -C "$ROOT" add "$GO_CONSTANTS" "$PYTHON_PYPROJECT"
  run git -C "$ROOT" commit -m "chore: release sandbox-go and brimble-sandbox v${version}"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=true ;;
      --skip-tests) SKIP_TESTS=true ;;
      --skip-python) SKIP_PYTHON=true ;;
      --skip-go) SKIP_GO=true ;;
      --skip-push) SKIP_PUSH=true ;;
      --no-commit) NO_COMMIT=true ;;
      -h|--help)
        usage
        exit 0
        ;;
      -*)
        echo "error: unknown option: $1" >&2
        usage >&2
        exit 1
        ;;
      *)
        if [[ -n "$VERSION" ]]; then
          echo "error: unexpected extra argument: $1" >&2
          exit 1
        fi
        VERSION="$1"
        ;;
    esac
    shift
  done

  if [[ -z "$VERSION" ]]; then
    echo "error: version argument is required (e.g. 0.1.4)" >&2
    usage >&2
    exit 1
  fi

  if ! semver_ok "$VERSION"; then
    echo "error: version must look like semver (e.g. 0.1.4): $VERSION" >&2
    exit 1
  fi
}

main() {
  parse_args "$@"

  require_cmd git
  require_cmd python3
  require_cmd go

  if [[ "$SKIP_PYTHON" == false || "$SKIP_TESTS" == false ]]; then
    PYTHON_BIN="$(ensure_python_tooling)"
  fi

  set_version_files "$VERSION"

  if [[ "$SKIP_TESTS" == false ]]; then
    run_go_tests
    run_python_tests "$PYTHON_BIN"
  fi

  commit_version_bump "$VERSION"

  if [[ "$SKIP_PYTHON" == false ]]; then
    publish_python "$PYTHON_BIN" "$VERSION"
  fi

  if [[ "$SKIP_GO" == false ]]; then
    publish_go_tag "$VERSION"
  fi

  log "Done."
  if [[ "$SKIP_GO" == false ]]; then
    echo "Go:    go get ${GO_MODULE}@v${VERSION}"
  fi
  if [[ "$SKIP_PYTHON" == false ]]; then
    echo "Python: pip install brimble-sandbox==${VERSION}"
  fi
}

main "$@"
