import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ absWorkingDir: root, entryPoints: ['functions/report-renderers.ts'], outfile: 'functions/generated/report-renderers.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', logLevel: 'warning' });
