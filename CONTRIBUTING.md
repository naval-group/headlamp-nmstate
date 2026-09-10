# Contributing to Headlamp NMState Plugin

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). All commits must be signed off to certify that you wrote or have the right to submit the code.

Sign off your commits with:

```bash
git commit -s -m "Your commit message"
```

This adds a `Signed-off-by` line to your commit message.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b my-feature`
5. Make your changes
6. Run checks: `npm run lint && npm run tsc && npm run test`
7. Commit with sign-off: `git commit -s -m "feat: description"`
8. Push and open a Pull Request

## Development

```bash
npm install          # Install dependencies
npm run start        # Dev server with hot reload
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint check
npm run lint-fix     # Auto-fix lint issues
npm run tsc          # Type check
npm run format       # Format code
```

### Deploy locally (Flatpak)

```bash
npm run build
cp dist/main.js package.json ~/.var/app/io.kinvolk.Headlamp/config/Headlamp/plugins/nmstate/
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance

## Pull Request Process

1. Ensure all checks pass (lint, type check, tests, build)
2. Update documentation if needed
3. Fill in the PR template
4. All commits must have DCO sign-off
5. At least one maintainer approval is required

## Reporting Issues

- Use the GitHub issue templates for bug reports and feature requests
- Check existing issues before creating a new one

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
