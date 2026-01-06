import { describe, expect, test } from "bun:test";
import {
  buildDependencyGraph,
  topologicalSort,
  getBuildLayers,
  type DependencyGraph,
} from "./graph.js";
import type { PackageInfo } from "./workspace.js";

function createPackage(
  name: string,
  workspaceDeps: string[] = []
): PackageInfo {
  return {
    name,
    path: `/packages/${name}`,
    packageJson: { name, scripts: { build: "tsc" } },
    workspaceDeps,
  };
}

describe("buildDependencyGraph", () => {
  test("creates empty graph for no packages", () => {
    const packages = new Map<string, PackageInfo>();
    const graph = buildDependencyGraph(packages);

    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.size).toBe(0);
    expect(graph.reverseEdges.size).toBe(0);
  });

  test("creates graph with no edges for independent packages", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b")],
    ]);

    const graph = buildDependencyGraph(packages);

    expect(graph.nodes.size).toBe(2);
    expect(graph.edges.get("pkg-a")?.size).toBe(0);
    expect(graph.edges.get("pkg-b")?.size).toBe(0);
  });

  test("creates edges for workspace dependencies", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b", ["pkg-a"])],
    ]);

    const graph = buildDependencyGraph(packages);

    expect(graph.edges.get("pkg-b")?.has("pkg-a")).toBe(true);
    expect(graph.reverseEdges.get("pkg-a")?.has("pkg-b")).toBe(true);
  });

  test("ignores dependencies not in workspace", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a", ["external-pkg"])],
    ]);

    const graph = buildDependencyGraph(packages);

    expect(graph.edges.get("pkg-a")?.size).toBe(0);
  });
});

describe("topologicalSort", () => {
  test("returns empty array for empty graph", () => {
    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
    };

    const sorted = topologicalSort(graph);
    expect(sorted).toEqual([]);
  });

  test("returns single package for single node", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);

    expect(sorted).toEqual(["pkg-a"]);
  });

  test("sorts dependencies before dependents", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b", ["pkg-a"])],
      ["pkg-c", createPackage("pkg-c", ["pkg-b"])],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);

    expect(sorted.indexOf("pkg-a")).toBeLessThan(sorted.indexOf("pkg-b"));
    expect(sorted.indexOf("pkg-b")).toBeLessThan(sorted.indexOf("pkg-c"));
  });

  test("handles diamond dependencies", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b", ["pkg-a"])],
      ["pkg-c", createPackage("pkg-c", ["pkg-a"])],
      ["pkg-d", createPackage("pkg-d", ["pkg-b", "pkg-c"])],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);

    expect(sorted.indexOf("pkg-a")).toBeLessThan(sorted.indexOf("pkg-b"));
    expect(sorted.indexOf("pkg-a")).toBeLessThan(sorted.indexOf("pkg-c"));
    expect(sorted.indexOf("pkg-b")).toBeLessThan(sorted.indexOf("pkg-d"));
    expect(sorted.indexOf("pkg-c")).toBeLessThan(sorted.indexOf("pkg-d"));
  });

  test("throws on circular dependency", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a", ["pkg-b"])],
      ["pkg-b", createPackage("pkg-b", ["pkg-a"])],
    ]);

    const graph = buildDependencyGraph(packages);

    expect(() => topologicalSort(graph)).toThrow(/Circular dependency/);
  });
});

describe("getBuildLayers", () => {
  test("returns empty array for no packages", () => {
    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
    };

    const layers = getBuildLayers([], graph);
    expect(layers).toEqual([]);
  });

  test("puts independent packages in same layer", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b")],
      ["pkg-c", createPackage("pkg-c")],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);
    const layers = getBuildLayers(sorted, graph);

    expect(layers.length).toBe(1);
    expect(layers[0].sort()).toEqual(["pkg-a", "pkg-b", "pkg-c"]);
  });

  test("separates dependent packages into layers", () => {
    const packages = new Map<string, PackageInfo>([
      ["pkg-a", createPackage("pkg-a")],
      ["pkg-b", createPackage("pkg-b", ["pkg-a"])],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);
    const layers = getBuildLayers(sorted, graph);

    expect(layers.length).toBe(2);
    expect(layers[0]).toEqual(["pkg-a"]);
    expect(layers[1]).toEqual(["pkg-b"]);
  });

  test("handles complex dependency graph", () => {
    const packages = new Map<string, PackageInfo>([
      ["core", createPackage("core")],
      ["utils", createPackage("utils")],
      ["lib-a", createPackage("lib-a", ["core"])],
      ["lib-b", createPackage("lib-b", ["core", "utils"])],
      ["app", createPackage("app", ["lib-a", "lib-b"])],
    ]);

    const graph = buildDependencyGraph(packages);
    const sorted = topologicalSort(graph);
    const layers = getBuildLayers(sorted, graph);

    expect(layers.length).toBe(3);
    expect(layers[0].sort()).toEqual(["core", "utils"]);
    expect(layers[1].sort()).toEqual(["lib-a", "lib-b"]);
    expect(layers[2]).toEqual(["app"]);
  });
});
