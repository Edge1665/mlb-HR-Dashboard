import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');
const candidateExtensions = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs'];
const indexCandidateExtensions = [
  path.join('index.ts'),
  path.join('index.tsx'),
  path.join('index.js'),
  path.join('index.mjs'),
  path.join('index.cjs'),
];

function resolveAliasTarget(specifier) {
  if (!specifier.startsWith('@/')) {
    return null;
  }

  const relativeTarget = specifier.slice(2).replaceAll('/', path.sep);
  const baseTarget = path.join(srcRoot, relativeTarget);

  for (const extension of candidateExtensions) {
    const candidate = `${baseTarget}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const indexRelativePath of indexCandidateExtensions) {
    const candidate = path.join(baseTarget, indexRelativePath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolveLocalTarget(specifier, parentURL) {
  if (!parentURL || (!specifier.startsWith('./') && !specifier.startsWith('../'))) {
    return null;
  }

  const parentPath = fileURLToPath(parentURL);
  const baseTarget = path.resolve(path.dirname(parentPath), specifier);

  for (const extension of candidateExtensions) {
    const candidate = `${baseTarget}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const indexRelativePath of indexCandidateExtensions) {
    const candidate = path.join(baseTarget, indexRelativePath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const aliasTarget = resolveAliasTarget(specifier);

    if (aliasTarget) {
      return {
        shortCircuit: true,
        url: pathToFileURL(aliasTarget).href,
      };
    }

    const localTarget = resolveLocalTarget(specifier, context.parentURL);

    if (localTarget) {
      return {
        shortCircuit: true,
        url: pathToFileURL(localTarget).href,
      };
    }

    return nextResolve(specifier, context);
  },
});
