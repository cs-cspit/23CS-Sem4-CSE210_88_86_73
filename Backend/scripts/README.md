# Smart Shelf Backend Scripts

This directory contains utility scripts for the Smart Shelf backend.

## Available Scripts

### Test Runner (`test-runner.js`)

A utility script for running tests with various options.

**Usage:**
```
node scripts/test-runner.js [options]
```

**Options:**
- `--watch`: Run tests in watch mode
- `--unit`: Run only unit tests
- `--coverage`: Generate test coverage report
- `--file=<filename>`: Run tests in a specific file
- `--help`: Show help message

**Examples:**
```
npm run test:runner -- --watch
npm run test:runner -- --coverage
npm run test:runner -- --file=auth.test.js
```

### Code Formatter (`format-code.js`)

This script formats all JavaScript files in the project using Prettier.

**Usage:**
```
npm run format
```

It will format the code based on the configuration in `.prettierrc`, which will be created automatically if it doesn't exist.

## Adding New Scripts

When adding new utility scripts to this directory:

1. Make the script executable with a shebang line (`#!/usr/bin/env node`)
2. Add appropriate documentation in the script file
3. Add an entry in package.json under the "scripts" section
4. Update this README with information about the new script 