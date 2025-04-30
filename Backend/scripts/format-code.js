#!/usr/bin/env node

/**
 * Code Formatting Script
 * 
 * This script formats all JavaScript files in the project using Prettier.
 * Run it with: node scripts/format-code.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if prettier is installed
try {
  require.resolve('prettier');
} catch (e) {
  console.error('Prettier is not installed. Please run: npm install --save-dev prettier');
  process.exit(1);
}

// Configure paths to format
const directories = [
  path.join(__dirname, '..', 'models'),
  path.join(__dirname, '..', 'routes'),
  path.join(__dirname, '..', 'middleware'),
  path.join(__dirname, '..', 'tests'),
  path.join(__dirname, '..', 'scripts'),
  path.join(__dirname, '..', 'server.js')
];

// Function to format files
async function formatFiles() {
  console.log('Running Prettier to format code...');
  
  // Create .prettierrc if it doesn't exist
  const prettierrcPath = path.join(__dirname, '..', '.prettierrc');
  if (!fs.existsSync(prettierrcPath)) {
    const prettierConfig = {
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 100,
      tabWidth: 2,
      semi: true
    };
    
    fs.writeFileSync(prettierrcPath, JSON.stringify(prettierConfig, null, 2));
    console.log('Created .prettierrc configuration file');
  }
  
  // Run prettier on each directory
  for (const dir of directories) {
    try {
      if (fs.existsSync(dir)) {
        const pattern = fs.statSync(dir).isDirectory() ? `${dir}/**/*.js` : dir;
        const child = spawn('npx', ['prettier', '--write', pattern], { stdio: 'inherit' });
        
        await new Promise((resolve, reject) => {
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Prettier failed with code ${code}`));
            }
          });
          
          child.on('error', reject);
        });
      }
    } catch (error) {
      console.error(`Error formatting ${dir}: ${error.message}`);
    }
  }
  
  console.log('Code formatting complete!');
}

// Run the formatting function
formatFiles().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}); 