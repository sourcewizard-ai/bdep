import { promises as fs } from "fs";
import * as path from "path";
import { glob } from "glob";

export interface PackageInfo {
  name: string;
  path: string;
  packageJson: PackageJsonData;
  workspaceDeps: string[];
}

export interface PackageJsonData {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

export async function parsePackageJson(packagePath: string): Promise<PackageJsonData> {
  const content = await fs.readFile(path.join(packagePath, "package.json"), "utf-8");
  return JSON.parse(content);
}

export async function getWorkspacePatterns(packageJson: PackageJsonData): Promise<string[]> {
  if (!packageJson.workspaces) {
    return [];
  }

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  return packageJson.workspaces.packages || [];
}

export function extractWorkspaceDependencies(packageJson: PackageJsonData): string[] {
  const deps: string[] = [];
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  for (const [name, version] of Object.entries(allDeps)) {
    if (typeof version === "string" && version.startsWith("workspace:")) {
      deps.push(name);
    }
  }

  return deps;
}

export async function findWorkspaceRoot(startPath: string): Promise<string> {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    try {
      const packageJsonPath = path.join(currentPath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson: PackageJsonData = JSON.parse(content);

      if (packageJson.workspaces) {
        return currentPath;
      }
    } catch {
      // Continue
    }

    currentPath = path.dirname(currentPath);
  }

  return startPath;
}

async function discoverAllWorkspacePackages(rootPath: string): Promise<Map<string, PackageInfo>> {
  const packages = new Map<string, PackageInfo>();
  const visited = new Set<string>();

  async function processDirectory(dirPath: string): Promise<void> {
    const realPath = await fs.realpath(dirPath);
    if (visited.has(realPath)) return;
    visited.add(realPath);

    let packageJson: PackageJsonData;
    try {
      packageJson = await parsePackageJson(dirPath);
    } catch {
      return;
    }

    const name = packageJson.name || path.basename(dirPath);
    const workspaceDeps = extractWorkspaceDependencies(packageJson);

    packages.set(name, {
      name,
      path: dirPath,
      packageJson,
      workspaceDeps,
    });

    const patterns = await getWorkspacePatterns(packageJson);
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: dirPath,
        absolute: true,
        ignore: ["**/node_modules/**"],
      });

      for (const match of matches) {
        const stat = await fs.stat(match);
        if (stat.isDirectory()) {
          await processDirectory(match);
        }
      }
    }
  }

  await processDirectory(rootPath);
  return packages;
}

export async function collectDependencies(
  cwd: string
): Promise<Map<string, PackageInfo>> {
  const packageJson = await parsePackageJson(cwd);
  const currentName = packageJson.name || path.basename(cwd);
  const workspaceDeps = extractWorkspaceDependencies(packageJson);

  if (workspaceDeps.length === 0) {
    return new Map();
  }

  const workspaceRoot = await findWorkspaceRoot(cwd);
  const allPackages = await discoverAllWorkspacePackages(workspaceRoot);

  const result = new Map<string, PackageInfo>();
  const visited = new Set<string>();

  function collectRecursive(depName: string): void {
    if (visited.has(depName)) return;
    visited.add(depName);

    const pkg = allPackages.get(depName);
    if (!pkg) return;

    result.set(depName, pkg);

    for (const transitiveDep of pkg.workspaceDeps) {
      collectRecursive(transitiveDep);
    }
  }

  for (const dep of workspaceDeps) {
    collectRecursive(dep);
  }

  return result;
}
