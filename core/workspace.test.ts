import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import {
  extractWorkspaceDependencies,
  getWorkspacePatterns,
  parsePackageJson,
  findWorkspaceRoot,
  collectDependencies,
  type PackageJsonData,
} from "./workspace.js";

describe("extractWorkspaceDependencies", () => {
  test("returns empty array for no dependencies", () => {
    const packageJson: PackageJsonData = { name: "test" };
    expect(extractWorkspaceDependencies(packageJson)).toEqual([]);
  });

  test("extracts workspace: dependencies", () => {
    const packageJson: PackageJsonData = {
      name: "test",
      dependencies: {
        "pkg-a": "workspace:*",
        "pkg-b": "workspace:^1.0.0",
        lodash: "^4.0.0",
      },
    };

    const deps = extractWorkspaceDependencies(packageJson);
    expect(deps.sort()).toEqual(["pkg-a", "pkg-b"]);
  });

  test("extracts from devDependencies too", () => {
    const packageJson: PackageJsonData = {
      name: "test",
      dependencies: {
        "pkg-a": "workspace:*",
      },
      devDependencies: {
        "pkg-b": "workspace:*",
      },
    };

    const deps = extractWorkspaceDependencies(packageJson);
    expect(deps.sort()).toEqual(["pkg-a", "pkg-b"]);
  });

  test("ignores non-workspace dependencies", () => {
    const packageJson: PackageJsonData = {
      name: "test",
      dependencies: {
        lodash: "^4.0.0",
        react: "^18.0.0",
      },
    };

    expect(extractWorkspaceDependencies(packageJson)).toEqual([]);
  });
});

describe("getWorkspacePatterns", () => {
  test("returns empty array for no workspaces", async () => {
    const packageJson: PackageJsonData = { name: "test" };
    expect(await getWorkspacePatterns(packageJson)).toEqual([]);
  });

  test("returns array workspaces directly", async () => {
    const packageJson: PackageJsonData = {
      name: "test",
      workspaces: ["packages/*", "apps/*"],
    };

    expect(await getWorkspacePatterns(packageJson)).toEqual([
      "packages/*",
      "apps/*",
    ]);
  });

  test("extracts packages from object workspaces", async () => {
    const packageJson: PackageJsonData = {
      name: "test",
      workspaces: { packages: ["packages/*"] },
    };

    expect(await getWorkspacePatterns(packageJson)).toEqual(["packages/*"]);
  });
});

describe("parsePackageJson", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bdep-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("parses valid package.json", async () => {
    const packageJson = {
      name: "test-package",
      version: "1.0.0",
      scripts: { build: "tsc" },
    };

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson)
    );

    const result = await parsePackageJson(tempDir);
    expect(result.name).toBe("test-package");
    expect(result.version).toBe("1.0.0");
    expect(result.scripts?.build).toBe("tsc");
  });

  test("throws for missing package.json", async () => {
    await expect(parsePackageJson(tempDir)).rejects.toThrow();
  });
});

describe("findWorkspaceRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bdep-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("finds root with workspaces field", async () => {
    const nestedDir = path.join(tempDir, "packages", "pkg-a");
    await fs.mkdir(nestedDir, { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] })
    );
    await fs.writeFile(
      path.join(nestedDir, "package.json"),
      JSON.stringify({ name: "pkg-a" })
    );

    const root = await findWorkspaceRoot(nestedDir);
    expect(root).toBe(tempDir);
  });

  test("returns start path if no workspace root found", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "no-workspaces" })
    );

    const root = await findWorkspaceRoot(tempDir);
    expect(root).toBe(tempDir);
  });
});

describe("collectDependencies", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bdep-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty map when no workspace dependencies", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "app", dependencies: { lodash: "^4.0.0" } })
    );

    const deps = await collectDependencies(tempDir);
    expect(deps.size).toBe(0);
  });

  test("collects direct workspace dependencies", async () => {
    await fs.mkdir(path.join(tempDir, "packages", "core"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "app"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "core", "package.json"),
      JSON.stringify({ name: "core", scripts: { build: "tsc" } })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "app", "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: { core: "workspace:*" },
      })
    );

    const appDir = path.join(tempDir, "packages", "app");
    const deps = await collectDependencies(appDir);

    expect(deps.size).toBe(1);
    expect(deps.has("core")).toBe(true);
  });

  test("collects transitive workspace dependencies", async () => {
    await fs.mkdir(path.join(tempDir, "packages", "utils"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "core"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "app"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "utils", "package.json"),
      JSON.stringify({ name: "utils" })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "core", "package.json"),
      JSON.stringify({
        name: "core",
        dependencies: { utils: "workspace:*" },
      })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "app", "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: { core: "workspace:*" },
      })
    );

    const appDir = path.join(tempDir, "packages", "app");
    const deps = await collectDependencies(appDir);

    expect(deps.size).toBe(2);
    expect(deps.has("core")).toBe(true);
    expect(deps.has("utils")).toBe(true);
  });

  test("deduplicates diamond dependencies", async () => {
    await fs.mkdir(path.join(tempDir, "packages", "shared"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "lib-a"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "lib-b"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "packages", "app"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "shared", "package.json"),
      JSON.stringify({ name: "shared" })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "lib-a", "package.json"),
      JSON.stringify({
        name: "lib-a",
        dependencies: { shared: "workspace:*" },
      })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "lib-b", "package.json"),
      JSON.stringify({
        name: "lib-b",
        dependencies: { shared: "workspace:*" },
      })
    );
    await fs.writeFile(
      path.join(tempDir, "packages", "app", "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: {
          "lib-a": "workspace:*",
          "lib-b": "workspace:*",
        },
      })
    );

    const appDir = path.join(tempDir, "packages", "app");
    const deps = await collectDependencies(appDir);

    expect(deps.size).toBe(3);
    expect(deps.has("lib-a")).toBe(true);
    expect(deps.has("lib-b")).toBe(true);
    expect(deps.has("shared")).toBe(true);
  });
});
