import { promises as fs } from "fs";
import * as path from "path";

const EXCLUDE_DIRS = ["node_modules", "dist", ".next", "build", ".git", "coverage"];

async function walkDir(dir: string, exclude: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await walkDir(fullPath, exclude);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}

async function getMtime(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.mtimeMs;
}

async function getNewestMtime(dir: string, exclude: string[]): Promise<number> {
  const files = await walkDir(dir, exclude);
  if (files.length === 0) return 0;

  let newest = 0;
  for (const file of files) {
    try {
      const mtime = await getMtime(file);
      if (mtime > newest) newest = mtime;
    } catch {
      // Ignore errors
    }
  }

  return newest;
}

async function getOldestMtime(dir: string): Promise<number> {
  const files = await walkDir(dir, []);
  if (files.length === 0) return 0;

  let oldest = Infinity;
  for (const file of files) {
    try {
      const mtime = await getMtime(file);
      if (mtime < oldest) oldest = mtime;
    } catch {
      // Ignore errors
    }
  }

  return oldest === Infinity ? 0 : oldest;
}

export async function needsBuild(pkgPath: string): Promise<boolean> {
  const distPath = path.join(pkgPath, "dist");

  // Check if dist exists
  try {
    await fs.access(distPath);
  } catch {
    return true; // No dist → needs build
  }

  const newestSource = await getNewestMtime(pkgPath, EXCLUDE_DIRS);
  const oldestDist = await getOldestMtime(distPath);

  if (oldestDist === 0) return true; // Empty dist → needs build
  if (newestSource === 0) return false; // No sources → skip

  return newestSource > oldestDist;
}
