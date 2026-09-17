import fs from 'node:fs';
import path from 'node:path';

/**
 * The nearest directory at or above `from` that holds a package.json — for the
 * backend, `backend/`, whether the caller runs from source or from `dist/`.
 * Pass `__dirname`. Anything that reads a file which is not code (schema.sql,
 * test fixtures, eval/) must start from here: a path built from `__dirname`
 * alone points into `dist/` once compiled, where those files are not copied.
 */
export function packageRoot(from: string): string {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${from}`);
    dir = parent;
  }
}
