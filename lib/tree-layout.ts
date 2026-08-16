import type { Person, Relationship } from "./types";

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
};

export type LayoutEdge = {
  type: "parent" | "spouse";
  from: string;
  to: string;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 64;
const X_GAP = 40;
const Y_GAP = 120;

// Ids of persons that appear in at least one relationship row.
function getConnectedIds(persons: Person[], relationships: Relationship[]): Set<string> {
  const ids = new Set(persons.map((p) => p.id));
  const connected = new Set<string>();
  for (const r of relationships) {
    if (ids.has(r.person_id) && ids.has(r.related_person_id)) {
      connected.add(r.person_id);
      connected.add(r.related_person_id);
    }
  }
  return connected;
}

// Persons with no relationship rows at all — not yet placed in the tree.
// Shown in the unconnected-members drawer instead of the canvas.
export function getUnconnectedPersons(persons: Person[], relationships: Relationship[]): Person[] {
  const connectedIds = getConnectedIds(persons, relationships);
  return persons.filter((p) => !connectedIds.has(p.id));
}

/**
 * Computes a simple layered pedigree layout for connected persons only
 * (persons with no relationships are surfaced separately, see
 * `getUnconnectedPersons`):
 *  - generations stacked vertically (depth derived from parent edges)
 *  - spouses placed adjacent, treated as one unit when ordering
 *  - units within a generation ordered by their parents' average x
 */
export function computeLayout(
  allPersons: Person[],
  allRelationships: Relationship[],
): TreeLayout {
  if (allPersons.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const connectedIds = getConnectedIds(allPersons, allRelationships);
  const persons = allPersons.filter((p) => connectedIds.has(p.id));
  if (persons.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const ids = new Set(persons.map((p) => p.id));
  const parentEdges = allRelationships.filter(
    (r) => r.type === "parent" && ids.has(r.person_id) && ids.has(r.related_person_id),
  );
  const spouseEdges = allRelationships.filter(
    (r) => r.type === "spouse" && ids.has(r.person_id) && ids.has(r.related_person_id),
  );

  // parentsOf[child] = [parentIds]; childrenOf[parent] = [childIds]
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    parentsOf.set(e.person_id, [...(parentsOf.get(e.person_id) ?? []), e.related_person_id]);
    childrenOf.set(e.related_person_id, [...(childrenOf.get(e.related_person_id) ?? []), e.person_id]);
  }

  // Depth: longest distance from a root (person with no parents), so parents
  // always sit above their children even in uneven branches.
  const depth = new Map<string, number>();
  const resolveDepth = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const parents = parentsOf.get(id) ?? [];
    const d =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((p) => resolveDepth(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  persons.forEach((p) => resolveDepth(p.id, new Set()));

  // Spouses share a generation.
  const spouseOf = new Map<string, string>();
  for (const e of spouseEdges) {
    spouseOf.set(e.person_id, e.related_person_id);
    spouseOf.set(e.related_person_id, e.person_id);
  }
  for (const e of spouseEdges) {
    const d = Math.max(depth.get(e.person_id) ?? 0, depth.get(e.related_person_id) ?? 0);
    depth.set(e.person_id, d);
    depth.set(e.related_person_id, d);
  }

  // Group persons into units: a couple is one unit, a single person is one.
  type Unit = { memberIds: string[]; depth: number };
  const units: Unit[] = [];
  const visited = new Set<string>();
  for (const p of persons) {
    if (visited.has(p.id)) continue;
    const spouse = spouseOf.get(p.id);
    if (spouse && !visited.has(spouse)) {
      units.push({ memberIds: [p.id, spouse], depth: depth.get(p.id) ?? 0 });
      visited.add(p.id);
      visited.add(spouse);
    } else {
      units.push({ memberIds: [p.id], depth: depth.get(p.id) ?? 0 });
      visited.add(p.id);
    }
  }

  const maxDepth = Math.max(...units.map((u) => u.depth));
  const byGeneration: Unit[][] = Array.from({ length: maxDepth + 1 }, () => []);
  units.forEach((u) => byGeneration[u.depth].push(u));

  // Position of each unit's center, filled generation by generation.
  const unitX = new Map<Unit, number>();

  // Roots: order by name for determinism.
  byGeneration[0].sort((a, b) =>
    a.memberIds[0].localeCompare(b.memberIds[0], undefined, { sensitivity: "base" }),
  );

  for (let g = 0; g <= maxDepth; g++) {
    const row = byGeneration[g];
    if (g > 0) {
      // Order by the average x of the unit's parents.
      const parentX = (u: Unit) => {
        const xs: number[] = [];
        for (const id of u.memberIds) {
          for (const parentId of parentsOf.get(id) ?? []) {
            const unit = units.find((cand) => cand.memberIds.includes(parentId));
            const x = unit ? unitX.get(unit) : undefined;
            if (x !== undefined) xs.push(x);
          }
        }
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.MAX_SAFE_INTEGER;
      };
      row.sort((a, b) => parentX(a) - parentX(b));
    }
    // Lay the row out left to right, centered on x = 0.
    const unitWidth = (u: Unit) =>
      u.memberIds.length * NODE_WIDTH + (u.memberIds.length - 1) * X_GAP;
    const totalWidth =
      row.reduce((sum, u) => sum + unitWidth(u), 0) + (row.length - 1) * X_GAP;
    let cursor = -totalWidth / 2;
    for (const u of row) {
      unitX.set(u, cursor + unitWidth(u) / 2);
      cursor += unitWidth(u) + X_GAP;
    }
  }

  const nodes: LayoutNode[] = [];
  for (const u of units) {
    const cx = unitX.get(u) ?? 0;
    const y = u.depth * (NODE_HEIGHT + Y_GAP);
    if (u.memberIds.length === 1) {
      nodes.push({ id: u.memberIds[0], x: cx - NODE_WIDTH / 2, y });
    } else {
      nodes.push({ id: u.memberIds[0], x: cx - NODE_WIDTH - X_GAP / 2, y });
      nodes.push({ id: u.memberIds[1], x: cx + X_GAP / 2, y });
    }
  }

  const edges: LayoutEdge[] = [
    ...spouseEdges.map((e) => ({ type: "spouse" as const, from: e.person_id, to: e.related_person_id })),
    ...parentEdges.map((e) => ({ type: "parent" as const, from: e.related_person_id, to: e.person_id })),
  ];

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Shift so the top-left node starts at (0, 0).
  for (const n of nodes) {
    n.x -= minX;
    n.y -= minY;
  }

  return {
    nodes,
    edges,
    width: Math.max(...xs) - minX + NODE_WIDTH,
    height: Math.max(...ys) - minY + NODE_HEIGHT,
  };
}
