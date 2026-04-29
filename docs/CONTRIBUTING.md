# Contributing to RunSight

## Branch Strategy

- `main` — stable releases only
- `v0.1.0-dev` — current development branch
- Feature branches off `v0.1.0-dev` for large changes

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use |
|--------|-----|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or updating tests |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `chore:` | Build process, tooling, dependencies |

Examples:
```
feat: add project detector with Node.js detection
fix: handle missing package.json scripts gracefully
docs: update ARCHITECTURE.md with detector module
test: verify detector against mock project structures
```

## Code Style

- Node.js with CommonJS (`require`/`module.exports`)
- `async/await` for all async operations
- Descriptive variable names
- JSDoc comments on exported functions
- Error handling with try/catch, never swallow errors silently

## Development Setup

```bash
git clone <repo>
cd KiroVision
git checkout v0.1.0-dev
npm install
```

## Testing

Run the CLI against any project:
```bash
node cli.js /path/to/project --max-steps=5
```
