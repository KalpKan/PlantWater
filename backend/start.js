#!/usr/bin/env node

// Simple startup script for Cloud Run
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Plant It Backend via startup script...');
console.log('📁 Current directory:', process.cwd());
console.log('🔧 Environment:', process.env.NODE_ENV);
console.log('🔧 Port:', process.env.PORT || 8080);

// Set default port if not provided
if (!process.env.PORT) {
  process.env.PORT = 8080;
  console.log('🔧 Set default PORT to 8080');
}

// Start the main application
const child = spawn('node', ['src/index.js'], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (error) => {
  console.error('❌ Failed to start child process:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`📤 Child process exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📤 SIGTERM received, shutting down...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📤 SIGINT received, shutting down...');
  child.kill('SIGINT');
}); 