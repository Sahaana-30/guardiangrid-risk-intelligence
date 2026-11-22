import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// Bundle @nexconn/server-sdk TypeScript sources directly into the Node output
// because @nexconn/server-sdk v0.1.2 ships TS files without prebuilt dist/.
const externalDeps = Array.from(
  new Set([
    ...allDeps.filter((dep) => dep !== '@nexconn/server-sdk'),
    'axios',
  ])
);

await build({
  entryPoints: ['server.ts'],
  outfile: 'dist-server/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: externalDeps,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log('Built production server bundle -> dist-server/server.mjs');
