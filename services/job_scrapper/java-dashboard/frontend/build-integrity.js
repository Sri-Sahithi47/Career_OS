import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

function hashes(root, paths) {
  const result = {};
  function visit(path) {
    const entry = readdirSync(resolve(root, path), { withFileTypes: true });
    for (const item of entry) {
      const name = `${path}/${item.name}`;
      if (item.isDirectory()) visit(name);
      else result[name] = createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex');
    }
  }
  for (const path of paths) {
    if (path === 'src' || path === 'public' || path === 'assets') visit(path);
    else result[path] = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
  }
  return result;
}

export function buildIntegrity() {
  let root, output, sources;
  return {
    name: 'scraper-build-integrity',
    apply: 'build',
    configResolved(config) { root = config.root; output = resolve(root, config.build.outDir); },
    buildStart() {
      sources = hashes(root, ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'build-integrity.js']);
    },
    closeBundle() {
      // Include all emitted fonts/images as well as JS and CSS.
      const assets = {};
      function visit(directory) {
        for (const item of readdirSync(directory, { withFileTypes: true })) {
          const path = resolve(directory, item.name);
          if (item.isDirectory()) visit(path);
          else if (item.name !== 'build-integrity.json')
            assets[relative(output, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
        }
      }
      visit(output);
      writeFileSync(resolve(output, 'build-integrity.json'), JSON.stringify({ sources, assets }));
    },
  };
}
