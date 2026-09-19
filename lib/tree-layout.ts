import type { Person, Relationship } from "./types";

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
};

export type LayoutEdge = {
  id: string;
  type: "parent" | "spouse";
  from: string;
  to: string;
  // Precomputed SVG path for parent edges, drawn as a radial elbow (out from
  // the parent, arc across to the child's angle, out to the child) so the
  // tree reads as a circular dendrogram. Absent for spouse edges, which are
  // simple straight lines the canvas draws itself.
  path?: string;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export const NODE_WIDTH = 120;
export const AVATAR_SIZE = 64;
// Avatar (top) + a small gap + two lines of text (name, birth year) below it.
export const NODE_HEIGHT = AVATAR_SIZE + 8 + 32;
const X_GAP = 40;
// Minimum radial distance between consecutive generation rings.
const MIN_RING_GAP = 190;

// Freeform (placed-but-unconnected) nodes snap to a grid the same size as a
// pedigree node's footprint plus a little breathing room, so dropped or
// dragged people line up cleanly instead of landing at arbitrary pixels.
export const GRID_CELL_WIDTH = NODE_WIDTH + 24;
export const GRID_CELL_HEIGHT = NODE_HEIGHT + 24;

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_CELL_WIDTH) * GRID_CELL_WIDTH,
    y: Math.round(y / GRID_CELL_HEIGHT) * GRID_CELL_HEIGHT,
  };
}

// Ids of persons that appear in at least one relationship row.
export function getConnectedIds(persons: Person[], relationships: Relationship[]): Set<string> {
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

// Persons with no relationship rows and not yet dropped onto the canvas.
// Shown in the unconnected-members drawer.
export function getUnconnectedPersons(persons: Person[], relationships: Relationship[]): Person[] {
  const connectedIds = getConnectedIds(persons, relationships);
  return persons.filter((p) => !connectedIds.has(p.id) && !p.placed);
}

// Persons dropped onto the canvas (via the drawer) but not yet connected to
// anyone — shown in a grid on the canvas instead of the drawer.
export function getPlacedUnconnected(persons: Person[], relationships: Relationship[]): Person[] {
  const connectedIds = getConnectedIds(persons, relationships);
  return persons.filter((p) => !connectedIds.has(p.id) && p.placed);
}

// The list view's ordering: manual `list_order` first (unordered people
// last), then name. The radial graph lays siblings out clockwise in this
// same order, so the list view is the single source of truth — dragging a
// row in the list rearranges the circle.
export function sortPersonsForList(persons: Person[]): Person[] {
  return [...persons].sort((a, b) => {
    const ao = a.list_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.list_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
  });
}

// Generation depth (0 = a root with no parents) for every connected person,
// keyed by person id. Spouses share the deeper of their two depths. Used to
// stack the pedigree layout into rows, and to group the list view the same
// way. Persons with no relationships at all are absent from the result.
export function getGenerationDepths(
  persons: Person[],
  relationships: Relationship[],
): Map<string, number> {
  const connectedIds = getConnectedIds(persons, relationships);
  const ids = new Set(persons.filter((p) => connectedIds.has(p.id)).map((p) => p.id));

  const parentEdges = relationships.filter(
    (r) => r.type === "parent" && ids.has(r.person_id) && ids.has(r.related_person_id),
  );
  const spouseEdges = relationships.filter(
    (r) => r.type === "spouse" && ids.has(r.person_id) && ids.has(r.related_person_id),
  );

  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    parentsOf.set(e.person_id, [...(parentsOf.get(e.person_id) ?? []), e.related_person_id]);
  }

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
  ids.forEach((id) => resolveDepth(id, new Set()));

  for (const e of spouseEdges) {
    const d = Math.max(depth.get(e.person_id) ?? 0, depth.get(e.related_person_id) ?? 0);
    depth.set(e.person_id, d);
    depth.set(e.related_person_id, d);
  }

  return depth;
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
  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    parentsOf.set(e.person_id, [...(parentsOf.get(e.person_id) ?? []), e.related_person_id]);
  }

  // Depth: longest distance from a root (person with no parents), so parents
  // always sit above their children even in uneven branches. Spouses share
  // a generation.
  const depth = getGenerationDepths(allPersons, allRelationships);

  const spouseOf = new Map<string, string>();
  for (const e of spouseEdges) {
    spouseOf.set(e.person_id, e.related_person_id);
    spouseOf.set(e.related_person_id, e.person_id);
  }

  // Group persons into units: a couple is one unit, a single person is one.
  // Radial layout: generation 0 sits at the center and each deeper
  // generation forms a ring around it, like a circular dendrogram. A unit's
  // angular slice is inherited from its "tree parent" unit and split among
  // its own children in proportion to descendant count, so a lone root gets
  // the whole circle to hand out to its children.
  type Unit = { memberIds: string[]; depth: number };
  const units: Unit[] = [];
  const unitByPerson = new Map<string, Unit>();
  const visited = new Set<string>();
  for (const p of persons) {
    if (visited.has(p.id)) continue;
    const spouse = spouseOf.get(p.id);
    const unit: Unit =
      spouse && !visited.has(spouse)
        ? { memberIds: [p.id, spouse], depth: depth.get(p.id) ?? 0 }
        : { memberIds: [p.id], depth: depth.get(p.id) ?? 0 };
    units.push(unit);
    for (const id of unit.memberIds) {
      unitByPerson.set(id, unit);
      visited.add(id);
    }
  }
  // Units follow the list view's order (list_order, then name): sibling
  // units fan out clockwise in the same order their people appear in the
  // list, so reordering the list view rearranges the radial graph.
  const listRank = new Map<string, number>();
  sortPersonsForList(persons).forEach((p, i) => listRank.set(p.id, i));
  const unitRank = (u: Unit) =>
    Math.min(...u.memberIds.map((id) => listRank.get(id) ?? Number.MAX_SAFE_INTEGER));
  units.sort((a, b) => unitRank(a) - unitRank(b));

  const maxDepth = Math.max(...units.map((u) => u.depth));

  // Each unit's "tree parent" is the unit containing whichever parent
  // achieves the unit's own depth (the same parent getGenerationDepths used
  // to derive that depth), so the angular tree matches the ring a unit sits
  // on even when a child's two parents land in different units.
  const parentUnitOf = new Map<Unit, Unit | undefined>();
  for (const u of units) {
    let bestId: string | undefined;
    let bestDepth = -1;
    for (const id of u.memberIds) {
      if ((depth.get(id) ?? 0) !== u.depth) continue;
      for (const pid of parentsOf.get(id) ?? []) {
        const d = depth.get(pid) ?? 0;
        if (d > bestDepth) {
          bestDepth = d;
          bestId = pid;
        }
      }
    }
    parentUnitOf.set(u, bestId ? unitByPerson.get(bestId) : undefined);
  }

  const childrenOf = new Map<Unit, Unit[]>();
  for (const u of units) {
    const parentUnit = parentUnitOf.get(u);
    if (!parentUnit) continue;
    childrenOf.set(parentUnit, [...(childrenOf.get(parentUnit) ?? []), u]);
  }

  const byGeneration: Unit[][] = Array.from({ length: maxDepth + 1 }, () => []);
  units.forEach((u) => byGeneration[u.depth].push(u));
  const rootUnits = byGeneration[0];

  // Descendant leaf count, used to weight how much of a parent's angular
  // slice each child branch receives.
  const weightCache = new Map<Unit, number>();
  const weightOf = (u: Unit): number => {
    const cached = weightCache.get(u);
    if (cached !== undefined) return cached;
    const kids = childrenOf.get(u) ?? [];
    const w = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + weightOf(k), 0);
    weightCache.set(u, w);
    return w;
  };
  units.forEach(weightOf);

  // Mid-angle (radians) assigned to each unit, recursively subdividing a
  // parent's [start, end) slice among its children by weight.
  const angleOf = new Map<Unit, number>();
  const assignAngles = (row: Unit[], start: number, end: number) => {
    const totalWeight = row.reduce((sum, u) => sum + weightOf(u), 0) || 1;
    let cursor = start;
    for (const u of row) {
      const span = ((end - start) * weightOf(u)) / totalWeight;
      const a0 = cursor;
      const a1 = cursor + span;
      angleOf.set(u, (a0 + a1) / 2);
      const kids = childrenOf.get(u);
      if (kids && kids.length) assignAngles(kids, a0, a1);
      cursor = a1;
    }
  };
  // A root couple's own spouse line sits on a fixed horizontal axis (angle 0
  // / π — see the r < 1e-6 case below). Starting the children's sweep at
  // angle 0 too would put the *middle* child of any odd, evenly-weighted
  // sibling group at exactly angle π: an evenly split fan's middle slice
  // always lands opposite wherever the sweep starts. That puts its branch
  // line running collinear with — and right through — one of the parents.
  // Offsetting the sweep's start by a quarter turn keeps every root-level
  // child's angle off that axis.
  const ROOT_ANGLE_OFFSET = Math.PI / 2;
  assignAngles(rootUnits, ROOT_ANGLE_OFFSET, ROOT_ANGLE_OFFSET + 2 * Math.PI);

  // Ring radius per depth: 0 for a single root (it sits dead center), else
  // large enough that a ring's units don't crowd each other, growing by at
  // least MIN_RING_GAP per generation.
  const unitArcWidth = (u: Unit) => u.memberIds.length * (NODE_WIDTH + X_GAP);
  const radiusOf: number[] = [];
  radiusOf[0] = rootUnits.length <= 1 ? 0 : Math.max(MIN_RING_GAP, unitArcWidth(rootUnits[0]) * rootUnits.length / (2 * Math.PI));
  for (let d = 1; d <= maxDepth; d++) {
    const totalArc = byGeneration[d].reduce((sum, u) => sum + unitArcWidth(u), 0);
    const needed = totalArc / (2 * Math.PI);
    radiusOf[d] = Math.max(radiusOf[d - 1] + MIN_RING_GAP, needed);
  }

  // Person-id -> avatar-center point, relative to the tree's true center
  // (radius 0), used both for final node placement and for the parent-edge
  // arc math below. unitCenterOfPerson tracks each person's *unit* center —
  // the same point for both members of a couple (the midpoint of their
  // spouse line) — so parent edges can start from there instead of from one
  // parent's own avatar: a couple's edges to a shared child then start at the
  // exact same point and read as one line branching to each child, the way a
  // drop line from a marriage line does on a traditional pedigree chart.
  const relCenter = new Map<string, { x: number; y: number }>();
  const unitCenterOfPerson = new Map<string, { x: number; y: number }>();
  for (const u of units) {
    const r = radiusOf[u.depth];
    const angle = angleOf.get(u) ?? 0;
    const dirX = r < 1e-6 ? 1 : Math.cos(angle);
    const dirY = r < 1e-6 ? 0 : Math.sin(angle);
    const tangX = r < 1e-6 ? 1 : -Math.sin(angle);
    const tangY = r < 1e-6 ? 0 : Math.cos(angle);
    const cx = dirX * r;
    const cy = dirY * r;
    for (const id of u.memberIds) unitCenterOfPerson.set(id, { x: cx, y: cy });
    if (u.memberIds.length === 1) {
      relCenter.set(u.memberIds[0], { x: cx, y: cy });
    } else {
      const half = (NODE_WIDTH + X_GAP) / 2;
      relCenter.set(u.memberIds[0], { x: cx - tangX * half, y: cy - tangY * half });
      relCenter.set(u.memberIds[1], { x: cx + tangX * half, y: cy + tangY * half });
    }
  }

  // Bounding box (in true-center-relative space) from every node's avatar
  // center, used to shift the whole tree so it starts at (0, 0) — same
  // convention the old layered layout used.
  const relXs = [...relCenter.values()].map((c) => c.x);
  const relYs = [...relCenter.values()].map((c) => c.y);
  const shiftX = -Math.min(...relXs) + NODE_WIDTH / 2;
  const shiftY = -Math.min(...relYs) + AVATAR_SIZE / 2;

  const nodes: LayoutNode[] = units.flatMap((u) =>
    u.memberIds.map((id) => {
      const c = relCenter.get(id)!;
      return { id, x: c.x + shiftX - NODE_WIDTH / 2, y: c.y + shiftY - AVATAR_SIZE / 2 };
    }),
  );

  // Parent-edge connector: out from the parent UNIT's center — the midpoint
  // of the spouse line for a couple, so every child's edge starts at the
  // same point and the branch reads as one drop line off the marriage line —
  // to the ring midway to the child, arc across to the child's angle, then
  // out to the child's own avatar. Reads as a radial elbow instead of a
  // straight line cutting across the circle.
  const parentEdgePath = (fromId: string, toId: string): string => {
    const p = unitCenterOfPerson.get(fromId) ?? relCenter.get(fromId);
    const c = relCenter.get(toId);
    if (!p || !c) return "";
    const abs = (x: number, y: number) => `${x + shiftX} ${y + shiftY}`;
    const rp = Math.hypot(p.x, p.y);
    const rc = Math.hypot(c.x, c.y);
    if (rp < 1e-6) {
      return `M ${abs(p.x, p.y)} L ${abs(c.x, c.y)}`;
    }
    const ap = Math.atan2(p.y, p.x);
    const ac = Math.atan2(c.y, c.x);
    const rMid = (rp + rc) / 2;
    const bx1 = rMid * Math.cos(ap);
    const by1 = rMid * Math.sin(ap);
    const bx2 = rMid * Math.cos(ac);
    const by2 = rMid * Math.sin(ac);
    let delta = ac - ap;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${abs(p.x, p.y)} L ${abs(bx1, by1)} A ${rMid} ${rMid} 0 0 ${sweep} ${abs(bx2, by2)} L ${abs(c.x, c.y)}`;
  };

  const edges: LayoutEdge[] = [
    ...spouseEdges.map((e) => ({ id: e.id, type: "spouse" as const, from: e.person_id, to: e.related_person_id })),
    ...parentEdges.map((e) => ({
      id: e.id,
      type: "parent" as const,
      from: e.related_person_id,
      to: e.person_id,
      path: parentEdgePath(e.related_person_id, e.person_id),
    })),
  ];

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);

  return {
    nodes,
    edges,
    width: Math.max(...xs) - Math.min(...xs) + NODE_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT,
  };
}
