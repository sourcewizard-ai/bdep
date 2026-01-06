#!/usr/bin/env node

import * as os from "os";
import { Command } from "commander";
import { collectDependencies } from "./core/workspace.js";
import { buildDependencyGraph, topologicalSort, getBuildLayers } from "./core/graph.js";
import { buildAll } from "./core/builder.js";
import { detectPackageManager, runInstall } from "./utils/pm.js";
import { writeProgress, writeDone, isTTY, setStdinMode } from "./utils/progress.js";

interface Options {
  install?: boolean;
  force?: boolean;
  stdin?: boolean;
  parallel?: string;
}

const program = new Command();

program
  .name("bdep")
  .description("Build workspace dependencies in topological order with parallel execution")
  .version("0.1.0")
  .option("-i, --install", "Run package manager install before building")
  .option("-f, --force", "Force rebuild all packages, ignore mtime cache")
  .option("-p, --parallel <n>", `Max parallel builds (default: ${os.cpus().length})`)
  .option("--stdin", "Force stdin mode (no spinner, plain log output)")
  .action(async (options: Options) => {
    // Skip if already running inside another bdep
    if (process.env.BDEP_RUNNING) {
      return;
    }
    process.env.BDEP_RUNNING = "1";

    try {
      if (options.stdin) {
        setStdinMode(true);
      }

      const parallel = options.parallel ? parseInt(options.parallel, 10) : undefined;

      const cwd = process.cwd();

      if (options.install) {
        const pm = await detectPackageManager(cwd);
        writeProgress(`Installing dependencies (${pm})...`);
        await runInstall(pm, cwd);
      }

      writeProgress("Collecting workspace dependencies...");
      const packages = await collectDependencies(cwd);

      if (packages.size === 0) {
        writeDone();
        if (!isTTY()) console.log("No workspace dependencies.");
        return;
      }

      writeProgress(`Building dependency graph (${packages.size} packages)...`);
      const graph = buildDependencyGraph(packages);
      const sorted = topologicalSort(graph);
      const layers = getBuildLayers(sorted, graph);

      await buildAll(layers, packages, { force: options.force, parallel });

      writeDone();
    } catch (error) {
      const err = error as Error;
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
