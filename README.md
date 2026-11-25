# Brimble SDKs

Public SDK repository for Brimble Sandbox.

## Packages

- `sandbox` - TypeScript SDK (`@brimble/sandbox`)
- `sandbox-python` - Python SDK (`brimble-sandbox`)
- `sandbox-go` - Go SDK (`github.com/brimblehq/brimble-sdks/sandbox-go`)

## Release

Releases run from GitHub Actions: **Actions → Release → Run workflow**, then pick the package and enter the version (e.g. `0.1.7`, or `0.2.0-rc.1` for a pre-release).

| Package | Published to | Tag |
| --- | --- | --- |
| `sandbox` | npm (`@brimble/sandbox`, with provenance) | `sandbox/vX.Y.Z` |
| `sandbox-python` | PyPI (`brimble-sandbox`) | `sandbox-python/vX.Y.Z` |
| `sandbox-go` | Go module proxy | `sandbox-go/vX.Y.Z` |

The workflow sets the version in the package, runs its tests and build, publishes it, pushes a `chore(release)` commit with the tag to `main`, and creates a GitHub release with notes since the package's previous release.

Repository setup (once):

- `release` environment (Settings → Environments), optionally with required reviewers.
- `NPM_TOKEN` secret: npm automation token with publish access to `@brimble/sandbox`.
- `PYPI_API_TOKEN` secret, or leave it unset and add this repo's `release.yml` / `release` environment as a trusted publisher on the `brimble-sandbox` PyPI project.
