import type { Branch as StoredBranch, Person, Relationship } from "./types";

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  // Generation ring the node sits on (0 = the center generation).
  depth: number;
};

export type LayoutEdge = {
  id: string;
  // "branch" pairs a list-view branch's two parents who have no spouse
  // edge between them.
  type: "parent" | "spouse" | "branch";
  from: string;
  to: string;
  // Precomputed SVG path for parent edges, drawn as a radial elbow (out from
  // the parent, arc across to the child's angle, out to the child) so the
  // tree reads as a circular dendrogram. Absent for spouse and branch edges,
  // which are simple straight lines the canvas draws itself.
  path?: string;
};

// One generation's band on the radial canvas, in the same absolute space as
// the nodes: everything between innerRadius and outerRadius around `center`
// belongs to generation `depth` (0 = the center).
export type GenerationRing = {
  depth: number;
  innerRadius: number;
  outerRadius: number;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  center: { x: number; y: number };
  rings: GenerationRing[];
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

// A branch: two people from one generation, turned into the home of their
// children. It renders in the *next* generation's section of the list view,
// holding the couple's sons and daughters. The pair is saved in the
// `branches` table; this is the render-ready form, with its section and
// label derived from current data.
export type ListBranch = { id: string; childGroupLabel: string; label: string; parentIds: [string, string] };

// One <ul> of rows inside a list-view generation section: either a branch's
// children or the section's remaining people (e.g. spouses who married in).
// `key` is also the list view's reorder/list-ref key.
export type ListRowList = { key: string; branch?: ListBranch; persons: Person[] };

export type ListSection = { label: string; lists: ListRowList[] };

// "Generation N" sorts by N; "Not yet connected" goes last.
export function groupRank(label: string): number {
  const n = Number(label.replace("Generation ", ""));
  return Number.isFinite(n) ? n : Infinity;
}

// The list view's structure: people grouped by generation, each generation
// split into one list per branch (the children of both of its parents) and
// then everyone else, ordered within each list by `sortPersonsForList`.
// Unconnected people trail in "Not yet connected". A branch whose
// children's generation has nobody in it yet still gets its (otherwise
// empty) section. The radial graph is laid out from this same structure, so
// the list view is the single source of truth for the tree's arrangement.
export function buildListSections(
  persons: Person[],
  relationships: Relationship[],
  storedBranches: StoredBranch[],
): { sections: ListSection[]; branches: ListBranch[]; depths: Map<string, number> } {
  const depths = getGenerationDepths(persons, relationships);

  const byDepth = new Map<number, Person[]>();
  for (const p of persons) {
    const d = depths.get(p.id);
    if (d === undefined) continue;
    byDepth.set(d, [...(byDepth.get(d) ?? []), p]);
  }
  const byLabel = new Map<string, Person[]>();
  for (const [d, people] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    byLabel.set(`Generation ${d + 1}`, sortPersonsForList(people));
  }
  const unconnected = [
    ...getUnconnectedPersons(persons, relationships),
    ...getPlacedUnconnected(persons, relationships),
  ];
  if (unconnected.length > 0) byLabel.set("Not yet connected", sortPersonsForList(unconnected));

  // Saved branches, each placed in the generation below its parents (a
  // parent pair with no depth yet — not connected to anyone — counts as a
  // root couple).
  const personById = new Map(persons.map((p) => [p.id, p]));
  const branches: ListBranch[] = storedBranches.flatMap((b) => {
    const a = personById.get(b.parent_a_id);
    const c = personById.get(b.parent_b_id);
    if (!a || !c) return [];
    const d = Math.max(depths.get(a.id) ?? 0, depths.get(c.id) ?? 0);
    return [
      { id: b.id, childGroupLabel: `Generation ${d + 2}`, label: `${a.full_name} & ${c.full_name}`, parentIds: [a.id, c.id] },
    ];
  });

  const parentsOf = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    parentsOf.set(r.person_id, (parentsOf.get(r.person_id) ?? new Set()).add(r.related_person_id));
  }
  for (const b of branches) if (!byLabel.has(b.childGroupLabel)) byLabel.set(b.childGroupLabel, []);

  const sections = [...byLabel.keys()]
    .sort((x, y) => groupRank(x) - groupRank(y))
    .map((label) => {
      const people = byLabel.get(label) ?? [];
      const claimed = new Set<string>();
      const lists: ListRowList[] = branches
        .filter((b) => b.childGroupLabel === label)
        .map((b) => {
          const kids = people.filter((p) => {
            const parents = parentsOf.get(p.id);
            return !claimed.has(p.id) && !!parents?.has(b.parentIds[0]) && !!parents.has(b.parentIds[1]);
          });
          kids.forEach((k) => claimed.add(k.id));
          return { key: `branch:${b.id}`, branch: b, persons: kids };
        });
      const rest = people.filter((p) => !claimed.has(p.id));
      if (rest.length > 0) lists.push({ key: label, persons: rest });
      return { label, lists };
    });

  return { sections, branches, depths };
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
  storedBranches: StoredBranch[] = [],
): TreeLayout {
  const empty: TreeLayout = { nodes: [], edges: [], width: 0, height: 0, center: { x: 0, y: 0 }, rings: [] };
  if (allPersons.length === 0) return empty;

  const connectedIds = getConnectedIds(allPersons, allRelationships);
  const persons = allPersons.filter((p) => connectedIds.has(p.id));
  if (persons.length === 0) return empty;

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
  //
  // The list view dictates the arrangement: every person's rank is their
  // position reading the list top to bottom (generation sections, then each
  // section's branch lists, then its remaining people).
  const { sections, branches, depths: depth } = buildListSections(allPersons, allRelationships, storedBranches);
  const listRank = new Map<string, number>();
  for (const section of sections) {
    for (const list of section.lists) for (const p of list.persons) listRank.set(p.id, listRank.size);
  }
  const rankOf = (id: string) => listRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  persons.sort((a, b) => rankOf(a.id) - rankOf(b.id));

  const spouseOf = new Map<string, string>();
  for (const e of spouseEdges) {
    spouseOf.set(e.person_id, e.related_person_id);
    spouseOf.set(e.related_person_id, e.person_id);
  }
  // A branch's two parents sit together as a couple too, even without a
  // spouse edge, as long as neither already has a partner and they share a
  // generation — the list view presents them as their children's parents.
  for (const b of branches) {
    const [a, c] = b.parentIds;
    if (!ids.has(a) || !ids.has(c) || spouseOf.has(a) || spouseOf.has(c)) continue;
    if (depth.get(a) !== depth.get(c)) continue;
    spouseOf.set(a, c);
    spouseOf.set(c, a);
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
    // From generation 2 outward, a spouse who married in (no parents in the
    // tree) always sits on the right of their partner — the clockwise side,
    // i.e. memberIds[1] — so the family's own child comes first.
    if (unit.depth > 0 && unit.memberIds.length === 2) {
      const hasParents = (id: string) => (parentsOf.get(id) ?? []).length > 0;
      const [first, second] = unit.memberIds;
      if (!hasParents(first) && hasParents(second)) unit.memberIds = [second, first];
    }
    units.push(unit);
    for (const id of unit.memberIds) {
      unitByPerson.set(id, unit);
      visited.add(id);
    }
  }
  // Units follow the list view's order: sibling units fan out clockwise in
  // the same order their people appear in the list, so reordering the list
  // view rearranges the radial graph. A couple ranks by its member who is a
  // child in the tree, not by a spouse who married in (and sits in a
  // different list); failing that, by its earliest member.
  const unitRank = (u: Unit) => {
    const bloodline = u.memberIds.filter((id) => (parentsOf.get(id) ?? []).length > 0);
    return Math.min(...(bloodline.length ? bloodline : u.memberIds).map(rankOf));
  };
  units.sort((a, b) => unitRank(a) - unitRank(b));

  const maxDepth = Math.max(...units.map((u) => u.depth));

  // Each unit's "tree parent" is the unit containing whichever parent
  // achieves the unit's own depth (the same parent getGenerationDepths used
  // to derive that depth), so the angular tree matches the ring a unit sits
  // on even when a child's two parents land in different units. When both
  // parents qualify but sit in different units — children of a previous
  // relationship, e.g. a separated pair joined by a dotted branch line — the
  // smaller unit wins, i.e. the ex-partner who hasn't re-partnered, so those
  // children fan out on that side instead of among the current couple's.
  const parentUnitOf = new Map<Unit, Unit | undefined>();
  for (const u of units) {
    let best: Unit | undefined;
    let bestDepth = -1;
    for (const id of u.memberIds) {
      if ((depth.get(id) ?? 0) !== u.depth) continue;
      for (const pid of parentsOf.get(id) ?? []) {
        const d = depth.get(pid) ?? 0;
        const pu = unitByPerson.get(pid);
        if (!pu) continue;
        if (d > bestDepth || (d === bestDepth && best && pu.memberIds.length < best.memberIds.length)) {
          bestDepth = d;
          best = pu;
        }
      }
    }
    parentUnitOf.set(u, best);
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

  // Even spacing: the weighted split above only decides each ring's
  // clockwise order (so children stay on their parents' side of the circle);
  // every ring is then re-spread so its people sit evenly around the full
  // circle, a couple taking two people's worth of arc. Each ring is rotated
  // as a whole to stay as close as it can to those weighted angles.
  for (const row of byGeneration) {
    if (row.length < 2) continue;
    const ordered = [...row].sort((a, b) => (angleOf.get(a) ?? 0) - (angleOf.get(b) ?? 0));
    const totalPeople = ordered.reduce((sum, u) => sum + u.memberIds.length, 0);
    let cursor = 0;
    const even = ordered.map((u) => {
      const mid = ((cursor + u.memberIds.length / 2) / totalPeople) * 2 * Math.PI;
      cursor += u.memberIds.length;
      return mid;
    });
    let sinSum = 0;
    let cosSum = 0;
    ordered.forEach((u, i) => {
      const diff = (angleOf.get(u) ?? 0) - even[i];
      sinSum += Math.sin(diff);
      cosSum += Math.cos(diff);
    });
    const rotation = Math.atan2(sinSum, cosSum);
    ordered.forEach((u, i) => angleOf.set(u, even[i] + rotation));
  }

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
    const half = (NODE_WIDTH + X_GAP) / 2;
    // Outside generation 1 a couple's line is drawn as an arc around the
    // tree's center through both avatars, so its midpoint sits further out
    // than the straight chord's: on the unit's angle at the avatars' radius.
    const lineMidR = u.memberIds.length === 2 && u.depth > 0 ? Math.hypot(r, half) : r;
    for (const id of u.memberIds) unitCenterOfPerson.set(id, { x: dirX * lineMidR, y: dirY * lineMidR });
    if (u.memberIds.length === 1) {
      relCenter.set(u.memberIds[0], { x: cx, y: cy });
    } else {
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
      return { id, x: c.x + shiftX - NODE_WIDTH / 2, y: c.y + shiftY - AVATAR_SIZE / 2, depth: u.depth };
    }),
  );

  // Parent-edge connector: out from the parent UNIT's center — the midpoint
  // of the couple line for a couple, so every child's edge starts at the
  // same point and the branch reads as one drop line off the marriage line —
  // into the child's own generation band, arc across (inside that band, so
  // the line never runs around the parents' generation) to the child's
  // angle, then out to the top of the child's avatar (the edge facing the
  // tree's center). Reads as a radial elbow instead of a straight line
  // cutting across the circle.
  const parentEdgePath = (p: { x: number; y: number } | undefined, toId: string): string => {
    const c = relCenter.get(toId);
    if (!p || !c) return "";
    const abs = (x: number, y: number) => `${x + shiftX} ${y + shiftY}`;
    const rp = Math.hypot(p.x, p.y);
    const rc = Math.hypot(c.x, c.y);
    if (rc < 1e-6) return "";
    const ac = Math.atan2(c.y, c.x);
    const rTop = rc - AVATAR_SIZE / 2;
    const top = { x: rTop * Math.cos(ac), y: rTop * Math.sin(ac) };
    if (rp < 1e-6) {
      return `M ${abs(p.x, p.y)} L ${abs(top.x, top.y)}`;
    }
    const ap = Math.atan2(p.y, p.x);
    // Midway between the child band's inner edge and the child's avatar top.
    const childDepth = unitByPerson.get(toId)?.depth ?? 0;
    const bandInner = childDepth === 0 ? 0 : (radiusOf[childDepth - 1] + radiusOf[childDepth]) / 2;
    const rMid = Math.max(rp, (bandInner + rTop) / 2);
    const bx1 = rMid * Math.cos(ap);
    const by1 = rMid * Math.sin(ap);
    const bx2 = rMid * Math.cos(ac);
    const by2 = rMid * Math.sin(ac);
    let delta = ac - ap;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${abs(p.x, p.y)} L ${abs(bx1, by1)} A ${rMid} ${rMid} 0 0 ${sweep} ${abs(bx2, by2)} L ${abs(top.x, top.y)}`;
  };

  // Branch parents who aren't married to each other still get a (dotted)
  // line in the canvas, whether or not they ended up side by side.
  const isSpousePair = (a: string, c: string) =>
    spouseEdges.some(
      (e) =>
        (e.person_id === a && e.related_person_id === c) || (e.person_id === c && e.related_person_id === a),
    );
  const branchEdges = branches.filter(
    (b) => ids.has(b.parentIds[0]) && ids.has(b.parentIds[1]) && !isSpousePair(b.parentIds[0], b.parentIds[1]),
  );

  // Where a child's line starts. Two parents who are a couple (one unit):
  // the middle of their couple line. Two parents in different units but
  // joined by a branch line (a previous relationship): the middle of that
  // dotted line — straight in generation 1, an arc around the center
  // outside it, matching how the canvas draws it. Otherwise each parent's
  // own couple-line middle (or avatar), one line per parent.
  const branchPairKey = (a: string, c: string) => [a, c].sort().join("|");
  const branchLinked = new Set(branchEdges.map((b) => branchPairKey(b.parentIds[0], b.parentIds[1])));
  const lineMidpoint = (a: string, c: string): { x: number; y: number } | undefined => {
    const pa = relCenter.get(a);
    const pc = relCenter.get(c);
    if (!pa || !pc) return undefined;
    if ((depth.get(a) ?? 0) === 0 && (depth.get(c) ?? 0) === 0) {
      return { x: (pa.x + pc.x) / 2, y: (pa.y + pc.y) / 2 };
    }
    const r = (Math.hypot(pa.x, pa.y) + Math.hypot(pc.x, pc.y)) / 2;
    const a1 = Math.atan2(pa.y, pa.x);
    let delta = Math.atan2(pc.y, pc.x) - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return { x: r * Math.cos(a1 + delta / 2), y: r * Math.sin(a1 + delta / 2) };
  };
  const lineStart = (parentId: string, childId: string) => {
    const parents = parentsOf.get(childId) ?? [];
    if (parents.length === 2) {
      const [a, c] = parents;
      if (unitByPerson.get(a) === unitByPerson.get(c)) return unitCenterOfPerson.get(a);
      if (branchLinked.has(branchPairKey(a, c))) return lineMidpoint(a, c);
    }
    return unitCenterOfPerson.get(parentId) ?? relCenter.get(parentId);
  };

  const edges: LayoutEdge[] = [
    ...spouseEdges.map((e) => ({ id: e.id, type: "spouse" as const, from: e.person_id, to: e.related_person_id })),
    ...branchEdges.map((b) => ({ id: `branch:${b.id}`, type: "branch" as const, from: b.parentIds[0], to: b.parentIds[1] })),
    ...parentEdges.map((e) => ({
      id: e.id,
      type: "parent" as const,
      from: e.related_person_id,
      to: e.person_id,
      path: parentEdgePath(lineStart(e.related_person_id, e.person_id), e.person_id),
    })),
  ];

  // Generation bands: each ring's boundary sits halfway between its radius
  // and its neighbours', so every avatar lands in the middle of its band.
  // The outermost band extends half a ring gap past its avatars.
  const rings: GenerationRing[] = radiusOf.map((r, d) => ({
    depth: d,
    innerRadius: d === 0 ? 0 : (radiusOf[d - 1] + r) / 2,
    outerRadius: d === maxDepth ? r + MIN_RING_GAP / 2 : (r + radiusOf[d + 1]) / 2,
  }));

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);

  return {
    nodes,
    edges,
    width: Math.max(...xs) - Math.min(...xs) + NODE_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT,
    center: { x: shiftX, y: shiftY },
    rings,
  };
}
