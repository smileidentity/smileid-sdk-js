#!/usr/bin/env node

import { run, UsageError } from './app.js';

run({ argv: process.argv.slice(2) }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(error instanceof UsageError ? 2 : 1);
});
