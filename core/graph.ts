import type { PackageInfo } from "./workspace.js";

export interface DependencyGraph {
  nodes: Map<string, PackageInfo>;
  edges: Map<string, Set<string>>; // package -> packages it depends on
  reverseEdges: Map<string, Set<string>>; // package -> packages that depend on it
}

export function buildDependencyGraph(packages: Map<string, PackageInfo>): DependencyGraph {
  const nodes = new Map(packages);
  const edges = new Map<string, Set<string>>();
  const reverseEdges = new Map<string, Set<string>>();

  for (const [name] of packages) {
    edges.set(name, new Set());
    reverseEdges.set(name, new Set());
  }

  for (const [name, pkg] of packages) {
    for (const dep of pkg.workspaceDeps) {
      if (packages.has(dep)) {
        edges.get(name)!.add(dep);
        reverseEdges.get(dep)!.add(name);
      }
    }
  }

  return { nodes, edges, reverseEdges };
}

export function topologicalSort(graph: DependencyGraph): string[] {
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: string[] = [];

  for (const [name] of graph.nodes) {
    inDegree.set(name, graph.edges.get(name)!.size);
  }

  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const dependent of graph.reverseEdges.get(current) || []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (result.length !== graph.nodes.size) {
    const remaining = [...graph.nodes.keys()].filter((n) => !result.includes(n));
    throw new Error(`Circular dependency detected involving: ${remaining.join(", ")}`);
  }

  return result;
}

export function getBuildLayers(
  sortedPackages: string[],
  graph: DependencyGraph
): string[][] {
  const layers: string[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < sortedPackages.length) {
    const layer: string[] = [];

    for (const pkg of sortedPackages) {
      if (assigned.has(pkg)) continue;

      const deps = graph.edges.get(pkg) || new Set();
      const allDepsAssigned = [...deps].every((dep) => assigned.has(dep));

      if (allDepsAssigned) {
        layer.push(pkg);
      }
    }

    if (layer.length === 0) {
      throw new Error("Could not make progress - possible circular dependency");
    }

    for (const pkg of layer) {
      assigned.add(pkg);
    }

    layers.push(layer);
  }

  return layers;
}
