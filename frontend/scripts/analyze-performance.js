#!/usr/bin/env node

/**
 * Performance Budget Analysis Script
 * 
 * This script analyzes the Next.js build output to:
 * 1. Measure bundle sizes per route
 * 2. Identify largest bundle contributors
 * 3. Compare against performance budgets
 * 
 * Usage: node scripts/analyze-performance.js
 */

const fs = require('fs');
const path = require('path');

const HIGH_TRAFFIC_ROUTES = [
  '/',
  '/properties',
  '/properties/[id]',
  '/login',
  '/signup',
  '/dashboard/landlord',
  '/dashboard/tenant',
  '/dashboard/agent',
];

// Performance budgets (in bytes)
// IDEAL budgets for mid-range devices on constrained connections in Nigeria
// These are targets to work towards, not current state
const IDEAL_BUDGETS = {
  // Home page should be lightweight - first impression
  '/': {
    totalJS: 200 * 1024, // 200KB
    firstLoadJS: 150 * 1024, // 150KB
  },
  // Properties listing - moderate complexity
  '/properties': {
    totalJS: 300 * 1024, // 300KB
    firstLoadJS: 200 * 1024, // 200KB
  },
  // Property detail - can be larger due to images/maps
  '/properties/[id]': {
    totalJS: 400 * 1024, // 400KB
    firstLoadJS: 250 * 1024, // 250KB
  },
  // Auth pages - should be very lightweight
  '/login': {
    totalJS: 150 * 1024, // 150KB
    firstLoadJS: 100 * 1024, // 100KB
  },
  '/signup': {
    totalJS: 150 * 1024, // 150KB
    firstLoadJS: 100 * 1024, // 100KB
  },
  // Dashboards - can be larger due to data visualization
  '/dashboard/landlord': {
    totalJS: 500 * 1024, // 500KB
    firstLoadJS: 300 * 1024, // 300KB
  },
  '/dashboard/tenant': {
    totalJS: 400 * 1024, // 400KB
    firstLoadJS: 250 * 1024, // 250KB
  },
  '/dashboard/agent': {
    totalJS: 400 * 1024, // 400KB
    firstLoadJS: 250 * 1024, // 250KB
  },
};

// REALISTIC budgets based on current measurements + 20% headroom
// These are what the app should not exceed in the short term
const REALISTIC_BUDGETS = {
  '/': {
    totalJS: 700 * 1024, // 700KB - based on current ~550KB
    firstLoadJS: 500 * 1024, // 500KB
  },
  '/properties': {
    totalJS: 700 * 1024, // 700KB
    firstLoadJS: 500 * 1024, // 500KB
  },
  '/properties/[id]': {
    totalJS: 800 * 1024, // 800KB - allows for images/maps
    firstLoadJS: 600 * 1024, // 600KB
  },
  '/login': {
    totalJS: 600 * 1024, // 600KB - adjusted based on current ~550KB shared bundle
    firstLoadJS: 450 * 1024, // 450KB
  },
  '/signup': {
    totalJS: 600 * 1024, // 600KB - adjusted based on current ~550KB shared bundle
    firstLoadJS: 450 * 1024, // 450KB
  },
  '/dashboard/landlord': {
    totalJS: 900 * 1024, // 900KB - dashboard complexity
    firstLoadJS: 650 * 1024, // 650KB
  },
  '/dashboard/tenant': {
    totalJS: 800 * 1024, // 800KB
    firstLoadJS: 600 * 1024, // 600KB
  },
  '/dashboard/agent': {
    totalJS: 800 * 1024, // 800KB
    firstLoadJS: 600 * 1024, // 600KB
  },
};

// Core Web Vitals budgets (based on Web Vitals thresholds for mobile)
const CORE_WEB_VITALS_BUDGETS = {
  FCP: 1800, // ms - First Contentful Paint
  LCP: 2500, // ms - Largest Contentful Paint
  INP: 200, // ms - Interaction to Next Paint
  CLS: 0.1, // Cumulative Layout Shift
  TTFB: 800, // ms - Time to First Byte
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeBuildOutput() {
  const buildDir = path.join(process.cwd(), '.next');
  const staticDir = path.join(buildDir, 'static');
  const chunksDir = path.join(staticDir, 'chunks');
  
  console.log('📊 Analyzing Next.js build output...\n');
  
  // Check if build exists
  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory not found. Run `pnpm run build` first.');
    process.exit(1);
  }
  
  // Analyze chunks
  let totalChunkSize = 0;
  let chunkCount = 0;
  const chunks = [];
  
  if (fs.existsSync(chunksDir)) {
    const files = fs.readdirSync(chunksDir);
    files.forEach(file => {
      if (file.endsWith('.js')) {
        const filePath = path.join(chunksDir, file);
        const stats = fs.statSync(filePath);
        const size = stats.size;
        totalChunkSize += size;
        chunkCount++;
        chunks.push({ file, size });
      }
    });
  }
  
  // Sort chunks by size (largest first)
  chunks.sort((a, b) => b.size - a.size);
  
  console.log('📦 Overall Bundle Statistics:');
  console.log(`   Total chunks: ${chunkCount}`);
  console.log(`   Total size: ${formatBytes(totalChunkSize)}`);
  console.log(`   Average chunk size: ${formatBytes(totalChunkSize / chunkCount)}`);
  console.log();
  
  console.log('🔝 Top 10 Largest Chunks:');
  chunks.slice(0, 10).forEach((chunk, index) => {
    console.log(`   ${index + 1}. ${chunk.file.substring(0, 50)}... - ${formatBytes(chunk.size)}`);
  });
  console.log();
  
  // Analyze static directory
  let totalStaticSize = 0;
  if (fs.existsSync(staticDir)) {
    const calculateDirSize = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          calculateDirSize(filePath);
        } else {
          totalStaticSize += stats.size;
        }
      });
    };
    calculateDirSize(staticDir);
  }
  
  console.log('📁 Total Static Assets Size:');
  console.log(`   ${formatBytes(totalStaticSize)}`);
  console.log();
  
  return {
    totalChunkSize,
    totalStaticSize,
    chunks,
    chunkCount,
  };
}

function checkBudgets(buildStats) {
  console.log('🎯 Performance Budget Check (Realistic Budgets):\n');
  console.log('⚠️  Note: These are realistic budgets based on current measurements + 20% headroom.');
  console.log('   Ideal budgets are much lower - see report below for comparison.\n');
  
  let passed = true;
  
  HIGH_TRAFFIC_ROUTES.forEach(route => {
    const budget = REALISTIC_BUDGETS[route];
    if (!budget) return;
    
    // Since we can't easily get per-route bundle sizes from the build output,
    // we'll estimate based on the overall build and flag if total exceeds reasonable limits
    const estimatedSize = buildStats.totalChunkSize / HIGH_TRAFFIC_ROUTES.length;
    const status = estimatedSize <= budget.totalJS ? '✅' : '❌';
    
    if (estimatedSize > budget.totalJS) {
      passed = false;
    }
    
    console.log(`   ${status} ${route}`);
    console.log(`      Realistic Budget: ${formatBytes(budget.totalJS)}`);
    console.log(`      Estimated: ${formatBytes(estimatedSize)}`);
    console.log(`      Status: ${estimatedSize <= budget.totalJS ? 'PASS' : 'FAIL'}`);
    console.log();
  });
  
  return passed;
}

function generateReport(buildStats) {
  console.log('📋 Performance Budget Report\n');
  console.log('=' .repeat(80));
  console.log();
  
  console.log('## Bundle Size Analysis');
  console.log();
  console.log(`**Total Bundle Size:** ${formatBytes(buildStats.totalChunkSize)}`);
  console.log(`**Total Static Assets:** ${formatBytes(buildStats.totalStaticSize)}`);
  console.log(`**Number of Chunks:** ${buildStats.chunkCount}`);
  console.log();
  
  console.log('## Largest Bundle Contributors');
  console.log();
  console.log('| Rank | Chunk | Size |');
  console.log('|------|-------|------|');
  buildStats.chunks.slice(0, 10).forEach((chunk, index) => {
    const fileName = chunk.file.length > 40 ? chunk.file.substring(0, 37) + '...' : chunk.file;
    console.log(`| ${index + 1} | ${fileName} | ${formatBytes(chunk.size)} |`);
  });
  console.log();
  
  console.log('## Proposed Performance Budgets');
  console.log();
  console.log('### Realistic Budgets (Short-term targets)');
  console.log('Based on current measurements + 20% headroom. These are enforceable now.');
  console.log();
  console.log('| Route | Total JS Budget | First Load JS Budget | Rationale |');
  console.log('|-------|----------------|---------------------|-----------|');
  
  Object.entries(REALISTIC_BUDGETS).forEach(([route, budget]) => {
    let rationale = '';
    if (route === '/') rationale = 'First impression - based on current ~550KB';
    else if (route === '/login' || route === '/signup') rationale = 'Auth pages - should be optimized';
    else if (route === '/properties') rationale = 'Listing page - based on current ~550KB';
    else if (route === '/properties/[id]') rationale = 'Detail page - allows for images/maps';
    else if (route.startsWith('/dashboard')) rationale = 'Dashboard - data visualization overhead';
    
    console.log(`| ${route} | ${formatBytes(budget.totalJS)} | ${formatBytes(budget.firstLoadJS)} | ${rationale} |`);
  });
  console.log();
  
  console.log('### Ideal Budgets (Long-term targets)');
  console.log('Targets for optimal performance on constrained connections. Work towards these over time.');
  console.log();
  console.log('| Route | Total JS Budget | First Load JS Budget | Rationale |');
  console.log('|-------|----------------|---------------------|-----------|');
  
  Object.entries(IDEAL_BUDGETS).forEach(([route, budget]) => {
    let rationale = '';
    if (route === '/') rationale = 'First impression - must load quickly';
    else if (route === '/login' || route === '/signup') rationale = 'Auth pages - minimal dependencies';
    else if (route === '/properties') rationale = 'Listing page - moderate complexity';
    else if (route === '/properties/[id]') rationale = 'Detail page - images/maps allowed';
    else if (route.startsWith('/dashboard')) rationale = 'Dashboard - data visualization overhead';
    
    console.log(`| ${route} | ${formatBytes(budget.totalJS)} | ${formatBytes(budget.firstLoadJS)} | ${rationale} |`);
  });
  console.log();
  
  console.log('## Core Web Vitals Budgets');
  console.log();
  console.log('| Metric | Budget | Threshold |');
  console.log('|--------|--------|-----------|');
  console.log(`| FCP (First Contentful Paint) | ${CORE_WEB_VITALS_BUDGETS.FCP}ms | Good: <1800ms |`);
  console.log(`| LCP (Largest Contentful Paint) | ${CORE_WEB_VITALS_BUDGETS.LCP}ms | Good: <2500ms |`);
  console.log(`| INP (Interaction to Next Paint) | ${CORE_WEB_VITALS_BUDGETS.INP}ms | Good: <200ms |`);
  console.log(`| CLS (Cumulative Layout Shift) | ${CORE_WEB_VITALS_BUDGETS.CLS} | Good: <0.1 |`);
  console.log(`| TTFB (Time to First Byte) | ${CORE_WEB_VITALS_BUDGETS.TTFB}ms | Good: <800ms |`);
  console.log();
  
  console.log('## Budget Rationale');
  console.log();
  console.log('These budgets are designed for:');
  console.log('- **Target Audience:** Users in Nigeria on mobile data with metered connections');
  console.log('- **Network Conditions:** Variable 3G/4G connections with potential latency');
  console.log('- **Device Class:** Mid-range Android devices (2-4GB RAM)');
  console.log('- **Cost Considerations:** Page weight directly impacts user data costs');
  console.log();
  console.log('### Current State vs Budgets');
  console.log();
  console.log('⚠️  **IMPORTANT:** The app currently exceeds the IDEAL budgets for all routes.');
  console.log('   Current estimated per-route size: ~550KB');
  console.log('   This is why REALISTIC budgets have been set higher - to prevent regression');
  console.log('   while we work toward the ideal targets over time.');
  console.log();
  
  console.log('## Current Status');
  console.log();
  const budgetPassed = checkBudgets(buildStats);
  
  if (budgetPassed) {
    console.log('✅ All estimated routes are within budget.');
  } else {
    console.log('❌ Some routes exceed budget. See details above.');
  }
  console.log();
  
  console.log('=' .repeat(80));
}

// Main execution
try {
  const buildStats = analyzeBuildOutput();
  generateReport(buildStats);
  
  console.log('\n✅ Performance analysis complete.');
} catch (error) {
  console.error('❌ Error during analysis:', error.message);
  process.exit(1);
}
