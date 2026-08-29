#!/usr/bin/env node

/**
 * Performance Budget Check Script
 * 
 * Simple script to check if the build exceeds performance budgets.
 * Exits with code 1 if budgets are exceeded, 0 otherwise.
 * 
 * Usage: node scripts/check-performance-budget.js
 */

const fs = require('node:fs');
const path = require('node:path');

// REALISTIC budgets based on current measurements + 20% headroom
// These are what the app should not exceed in the short term
const BUDGETS = {
  '/': 700 * 1024, // 700KB
  '/properties': 700 * 1024, // 700KB
  '/properties/[id]': 800 * 1024, // 800KB
  '/login': 600 * 1024, // 600KB - adjusted based on current ~550KB shared bundle
  '/signup': 600 * 1024, // 600KB - adjusted based on current ~550KB shared bundle
  '/dashboard/landlord': 900 * 1024, // 900KB
  '/dashboard/tenant': 800 * 1024, // 800KB
  '/dashboard/agent': 800 * 1024, // 800KB
};

const HIGH_TRAFFIC_ROUTES = Object.keys(BUDGETS);

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkBudgets() {
  const buildDir = path.join(process.cwd(), '.next');
  const staticDir = path.join(buildDir, 'static');
  const chunksDir = path.join(staticDir, 'chunks');
  
  // Check if build exists
  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory not found. Run `pnpm run build` first.');
    process.exit(1);
  }
  
  // Calculate total chunk size
  let totalChunkSize = 0;
  if (fs.existsSync(chunksDir)) {
    const files = fs.readdirSync(chunksDir);
    files.forEach(file => {
      if (file.endsWith('.js')) {
        const filePath = path.join(chunksDir, file);
        const stats = fs.statSync(filePath);
        totalChunkSize += stats.size;
      }
    });
  }
  
  // Estimate per-route size
  const estimatedSize = totalChunkSize / HIGH_TRAFFIC_ROUTES.length;
  
  console.log('🎯 Performance Budget Check\n');
  console.log(`Total bundle size: ${formatBytes(totalChunkSize)}`);
  console.log(`Estimated per-route size: ${formatBytes(estimatedSize)}\n`);
  
  let failed = false;
  const failures = [];
  
  HIGH_TRAFFIC_ROUTES.forEach(route => {
    const budget = BUDGETS[route];
    const status = estimatedSize <= budget ? '✅' : '❌';
    
    if (estimatedSize > budget) {
      failed = true;
      failures.push({ route, budget, estimated: estimatedSize });
    }
    
    console.log(`${status} ${route}: ${formatBytes(estimatedSize)} / ${formatBytes(budget)}`);
  });
  
  console.log();
  
  if (failed) {
    console.log('❌ Budget check failed. The following routes exceed budget:\n');
    failures.forEach(({ route, budget, estimated }) => {
      console.log(`   ${route}: ${formatBytes(estimated)} exceeds ${formatBytes(budget)}`);
    });
    console.log('\nTo fix this:');
    console.log('1. Run `pnpm run analyze` to identify large dependencies');
    console.log('2. Consider code splitting or lazy loading heavy components');
    console.log('3. Remove unused dependencies');
    console.log('4. If this is expected, update the budget in scripts/check-performance-budget.js');
    process.exit(1);
  } else {
    console.log('✅ All routes within budget.');
    process.exit(0);
  }
}

checkBudgets();
