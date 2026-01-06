import { promises as fs } from "fs";
import * as path from "path";
import { runCommand } from "./exec.js";

interface PackageJsonInfo {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  workspaces?: string[] | { packages: string[] };
}

export async function detectPackageManager(packagePath: string): Promise<string> {
  const lockFiles = [
    { file: "bun.lockb", manager: "bun" as const },
    { file: "bun.lock", manager: "bun" as const },
    { file: "pnpm-lock.yaml", manager: "pnpm" as const },
    { file: "yarn.lock", manager: "yarn" as const },
    { file: "package-lock.json", manager: "npm" as const },
  ];

  const workspaceLockFiles = lockFiles.filter(({ manager }) =>
    manager === "bun" || manager === "pnpm"
  );

  const workspaceRoot = await findWorkspaceRoot(packagePath);

  const hasWorkspaceDeps = await checkForWorkspaceDependencies(workspaceRoot);
  if (hasWorkspaceDeps) {
    for (const { file, manager } of workspaceLockFiles) {
      try {
        await fs.access(path.join(workspaceRoot, file));
        return manager;
      } catch {
        continue;
      }
    }
    return 'pnpm';
  }

  for (const { file, manager } of lockFiles) {
    try {
      await fs.access(path.join(workspaceRoot, file));
      return manager;
    } catch {
      continue;
    }
  }

  try {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageInfo: PackageJsonInfo = JSON.parse(content);

    if (packageInfo.packageManager) {
      const manager = packageInfo.packageManager.split('@')[0];
      if (['npm', 'yarn', 'pnpm', 'bun'].includes(manager)) {
        return manager;
      }
    }
  } catch {
    // Continue if can't read package.json
  }

  return "npm";
}

export async function findWorkspaceRoot(startPath: string): Promise<string> {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    try {
      await fs.access(path.join(currentPath, 'pnpm-workspace.yaml'));
      return currentPath;
    } catch {
      // Continue
    }

    try {
      const packageJsonPath = path.join(currentPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageInfo: PackageJsonInfo = JSON.parse(content);

      if (packageInfo.workspaces) {
        return currentPath;
      }
    } catch {
      // Continue
    }

    currentPath = path.dirname(currentPath);
  }

  currentPath = startPath;
  while (currentPath !== path.dirname(currentPath)) {
    try {
      await fs.access(path.join(currentPath, '.git'));
      return currentPath;
    } catch {
      // Continue
    }

    currentPath = path.dirname(currentPath);
  }

  return startPath;
}

async function checkForWorkspaceDependencies(workspaceRoot: string): Promise<boolean> {
  const packageJsonFiles = await findPackageJsonFiles(workspaceRoot);

  for (const packageJsonFile of packageJsonFiles) {
    try {
      const content = await fs.readFile(packageJsonFile, 'utf-8');
      const packageInfo: PackageJsonInfo = JSON.parse(content);
      const allDeps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };

      const hasWorkspaceProtocol = Object.values(allDeps).some(version =>
        typeof version === 'string' && version.startsWith('workspace:')
      );

      if (hasWorkspaceProtocol) {
        return true;
      }
    } catch {
      // Continue
    }
  }

  return false;
}

async function findPackageJsonFiles(dir: string): Promise<string[]> {
  const packageJsonFiles: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name === 'package.json') {
        packageJsonFiles.push(fullPath);
      } else if (entry.isDirectory() && !['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
        const subPackageJsonFiles = await findPackageJsonFiles(fullPath);
        packageJsonFiles.push(...subPackageJsonFiles);
      }
    }
  } catch {
    // Ignore errors
  }

  return packageJsonFiles;
}

export async function runInstall(pm: string, cwd: string): Promise<void> {
  const command = `${pm} install`;
  await runCommand(command, cwd);
}
