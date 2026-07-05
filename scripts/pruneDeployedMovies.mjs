import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const deployedMoviesDir = resolve(process.cwd(), 'dist', 'movies');

await rm(deployedMoviesDir, { recursive: true, force: true });
console.log(`[vercel-prune] Removed ${deployedMoviesDir}`);