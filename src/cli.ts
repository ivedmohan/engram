#!/usr/bin/env node
import { loadConfig } from './config.js';

const [, , command] = process.argv;

async function status() {
  const config = loadConfig();
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/health`);
    const body = await res.json();
    console.log(res.ok ? '✅ engram daemon is up' : '⚠️  engram daemon responded with an error', body);
  } catch {
    console.log(`❌ engram daemon is not running on 127.0.0.1:${config.port}. Start it with: engram up`);
  }
}

switch (command) {
  case 'up':
  case 'daemon': {
    const { startDaemon } = await import('./daemon/server.js');
    startDaemon();
    break;
  }
  case 'status':
    await status();
    break;
  default:
    console.log('Usage: engram <up|daemon|status>');
    process.exitCode = command ? 1 : 0;
}
