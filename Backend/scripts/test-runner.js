#!/usr/bin/env node

/**
 * Test Runner Script
 * 
 * A utility script to run tests with various options.
 * 
 * Usage:
 *   node scripts/test-runner.js [options]
 * 
 * Options:
 *   --watch    Run tests in watch mode
 *   --unit     Run only unit tests
 *   --coverage Generate test coverage report
 *   --file=<filename> Run tests in a specific file
 *   --help     Show help message
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  unit: args.includes('--unit'),
  coverage: args.includes('--coverage'),
  help: args.includes('--help'),
  file: null
};

// Check for file option
const fileArg = args.find(arg => arg.startsWith('--file='));
if (fileArg) {
  options.file = fileArg.split('=')[1];
}

// Show help if requested
if (options.help) {
  console.log(`
Smart Shelf Test Runner

Usage:
  node scripts/test-runner.js [options]

Options:
  --watch            Run tests in watch mode
  --unit             Run only unit tests
  --coverage         Generate test coverage report
  --file=<filename>  Run tests in a specific file
  --help             Show this help message

Examples:
  node scripts/test-runner.js --watch
  node scripts/test-runner.js --coverage
  node scripts/test-runner.js --file=auth.test.js
  `);
  process.exit(0);
}

// Build the command
let command = 'npx';
let commandArgs = ['jest'];

// Add environment variables
const env = { ...process.env, NODE_ENV: 'test' };

// Add options
if (options.watch) {
  commandArgs.push('--watch');
}

if (options.coverage) {
  commandArgs.push('--coverage');
}

if (options.unit) {
  commandArgs.push('--testPathIgnorePatterns=integration');
}

if (options.file) {
  const testDir = path.join(__dirname, '..', 'tests');
  const testFile = path.join(testDir, options.file);
  
  if (fs.existsSync(testFile)) {
    commandArgs.push(testFile);
  } else {
    console.error(`Error: Test file not found: ${options.file}`);
    process.exit(1);
  }
}

// Add additional Jest options
commandArgs.push('--detectOpenHandles');
commandArgs.push('--testTimeout=10000');

// Run the command
console.log(`Running: ${command} ${commandArgs.join(' ')}`);
const child = spawn(command, commandArgs, { 
  env,
  stdio: 'inherit'
});

child.on('error', (error) => {
  console.error(`Error running tests: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code);
}); 