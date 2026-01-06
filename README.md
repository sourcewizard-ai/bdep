# BDep

No-config dependency builder for TypeScript monorepos.

## Overview

BDep automatically builds workspace dependencies in the correct order. It scans your `package.json` for `workspace:` protocol dependencies, constructs a dependency graph, and builds packages in parallel layers — respecting the topological order.

Key features:
- **Zero configuration** — just run `bdep` in any package directory
- **Automatic dependency resolution** — recursively finds all `workspace:*` dependencies
- **Parallel builds** — builds independent packages concurrently (limited to CPU cores)
- **Smart rebuilds** — skips unchanged packages by comparing source/dist mtimes
- **Nesting protection** — detects if called from within another bdep and skips

## Installation

Add bdep to your devDependencies:

```bash
# bun
bun add -d bdep

# npm
npm install -D bdep

# pnpm
pnpm add -D bdep

# yarn
yarn add -D bdep
```

Then add it to your package.json scripts to build dependencies before your app:

```json
{
  "scripts": {
    "dev": "bdep && your-dev-command",
    "build": "bdep && your-build-command"
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         bdep CLI                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Read package.json from current directory                │
│                 ↓                                           │
│  2. Find workspace root (look for workspaces field)         │
│                 ↓                                           │
│  3. Collect all workspace:* dependencies recursively        │
│                 ↓                                           │
│  4. Build dependency graph                                  │
│                 ↓                                           │
│  5. Topological sort (Kahn's algorithm)                     │
│                 ↓                                           │
│  6. Group into parallel layers                              │
│     ┌─────────┐                                             │
│     │ Layer 1 │ → packages with no deps (build in parallel) │
│     └────┬────┘                                             │
│          ↓                                                  │
│     ┌─────────┐                                             │
│     │ Layer 2 │ → packages depending on layer 1             │
│     └────┬────┘                                             │
│          ↓                                                  │
│     ┌─────────┐                                             │
│     │ Layer N │ → ...                                       │
│     └─────────┘                                             │
│                 ↓                                           │
│  7. For each package: check mtime, skip if unchanged        │
│                 ↓                                           │
│  8. Run `bun run build` for each package                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
bdep/
├── index.ts           # CLI entry point (commander.js)
├── core/
│   ├── workspace.ts   # Dependency collection, workspace discovery
│   ├── graph.ts       # Dependency graph, topological sort
│   └── builder.ts     # Build execution, concurrency control
└── utils/
    ├── exec.ts        # Shell command execution
    ├── mtime.ts       # File modification time comparison
    ├── pm.ts          # Package manager detection
    └── progress.ts    # TTY spinner and progress bar
```

## CLI Reference

```
Usage: bdep [options]

Options:
  -V, --version       Output version number
  -i, --install       Run package manager install before building
  -f, --force         Force rebuild all packages, ignore mtime cache
  -p, --parallel <n>  Max parallel builds (default: CPU cores)
  --stdin             Force stdin mode (no spinner, plain log output)
  -h, --help          Display help
```

### Examples

```bash
# Build dependencies of current package
bdep

# Install deps first, then build
bdep -i

# Force rebuild everything
bdep --force

# Limit to 4 parallel builds
bdep -p 4

# CI mode (no spinner)
bdep --stdin
```

## Contributing

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build

# Run tests
bun test
```
