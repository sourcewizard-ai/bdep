import * as os from "os";
import type { PackageInfo } from "./workspace.js";
import { runCommand } from "../utils/exec.js";
import { writeProgress, writeError, isTTY } from "../utils/progress.js";
import { needsBuild } from "../utils/mtime.js";

export interface BuildOptions {
  force?: boolean;
  parallel?: number;
}

function progressBar(completed: number, total: number, current: string[]): string {
  const filled = "■".repeat(completed);
  const empty = "□".repeat(total - completed);
  const label = current.length > 0 ? current.join(", ") : "";
  return `${filled}${empty} ${completed}/${total} ${label}`;
}

export interface BuildResult {
  name: string;
  status: "built" | "skipped" | "unchanged";
}

export async function buildPackage(pkg: PackageInfo, options: BuildOptions = {}): Promise<BuildResult> {
  const buildScript = pkg.packageJson.scripts?.build;

  if (!buildScript) {
    return { name: pkg.name, status: "skipped" };
  }

  if (!options.force) {
    const needs = await needsBuild(pkg.path);
    if (!needs) {
      return { name: pkg.name, status: "unchanged" };
    }
  }

  try {
    await runCommand("bun run build", pkg.path);
    return { name: pkg.name, status: "built" };
  } catch (error) {
    const err = error as Error & { stderr?: string };
    writeError(`Error: ${pkg.name} build failed`);
    if (err.stderr) {
      console.error(err.stderr);
    }
    throw new Error(`Build failed for ${pkg.name}`);
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then((result) => {
      results.push(result);
    });

    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(0, executing.length, ...executing.filter((e) => {
        let resolved = false;
        e.then(() => { resolved = true; });
        return !resolved;
      }));
    }
  }

  await Promise.all(executing);
  return results;
}

export async function buildAll(
  layers: string[][],
  packages: Map<string, PackageInfo>,
  options: BuildOptions = {}
): Promise<void> {
  const allBuildable = [...packages.values()].filter(p => p.packageJson.scripts?.build);
  const total = allBuildable.length;
  let completed = 0;
  let unchangedCount = 0;
  const tty = isTTY();
  const parallel = options.parallel ?? os.cpus().length;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const pkgs = layer.map((name) => packages.get(name)!);
    const buildable = pkgs.filter(p => p.packageJson.scripts?.build);

    if (buildable.length === 0) continue;

    const names = buildable.map(p => p.name);

    if (tty) {
      writeProgress(progressBar(completed, total, names));
    } else {
      console.log(`Building layer ${i + 1}/${layers.length}: ${names.join(", ")}`);
    }

    await runWithConcurrency(buildable, parallel, async (pkg) => {
      const result = await buildPackage(pkg, options);
      completed++;

      if (result.status === "unchanged") {
        unchangedCount++;
        if (!tty) {
          console.log(`  ${pkg.name}: unchanged`);
        }
      }

      if (tty) {
        const remaining = names.filter(n => n !== result.name);
        writeProgress(progressBar(completed, total, remaining));
      }

      return result;
    });
  }

  if (unchangedCount > 0 && !tty) {
    console.log(`Skipped ${unchangedCount} unchanged packages`);
  }
}
