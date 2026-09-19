"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectPersons, disconnectPersons, reorderPersons } from "@/lib/actions";
import {
  getGenerationDepths,
  getPlacedUnconnected,
  getUnconnectedPersons,
  sortPersonsForList,
} from "@/lib/tree-layout";
import AddRelativeForm from "./AddRelativeForm";
import PersonAvatar from "./PersonAvatar";
import type { Person, Relationship } from "@/lib/types";

type Group = { label: string; persons: Person[] };

// A branch-in-progress: two checked people from one generation, turned into
// a staging area (via "Create branch") that other rows can be dragged onto
// to become a child of both. Client-side only — it's just a place to collect
// drops; each drop writes real parent edges immediately.
type Branch = { id: string; groupLabel: string; label: string; parentIds: [string, string] };

// An in-progress pick-whip drag: from one row's parent-link handle to the
// pointer, After Effects parent-whip style.
type Whip = { fromId: string; originX: number; originY: number; x: number; y: number };

// Gently sagging quadratic curve from the whip handle to the pointer, so the
// line reads as a whip rather than a ruler.
function whipPath(w: Whip): string {
  const dx = w.x - w.originX;
  const dy = w.y - w.originY;
  const len = Math.hypot(dx, dy) || 1;
  const sag = Math.min(40, len * 0.15);
  const cx = (w.originX + w.x) / 2 - (dy / len) * sag;
  const cy = (w.originY + w.y) / 2 + (dx / len) * sag;
  return `M ${w.originX} ${w.originY} Q ${cx} ${cy} ${w.x} ${w.y}`;
}

// Index of the row a pointer at `y` should drop into, based on each row's
// current on-screen midpoint.
function indexForY(rows: HTMLElement[], y: number): number {
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return rows.length - 1;
}

// Flat alternative to the node graph: everyone grouped by generation (same
// depth calculation the graph uses to stack rows), with people who aren't
// connected to anyone yet in a trailing group. Each row's partner is set
// inline via a dropdown scoped to that person's own generation; a parent is
// set with a pick whip, After Effects parent-whip style — drag the ↑ handle
// on a child's row onto a parent's row anywhere in the list to link them
// (the stored edge is a generic "parent", so this works for a mother or
// father the same way). The owner can also drag the grip handle to reorder
// people within a group — order is saved as each person's `list_order` so
// it's shared with everyone viewing the tree. Tapping the pencil opens the
// full edit form.
export default function TreeList({
  token,
  persons,
  relationships,
  isOwner,
}: {
  token: string;
  persons: Person[];
  relationships: Relationship[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  // Parent pick-whip: drag the ↑ handle on a child's row and release it over
  // another row to add a parent edge. While dragging, a line follows the
  // pointer and the row under it lights up.
  const [whip, setWhip] = useState<Whip | null>(null);
  const [whipTargetId, setWhipTargetId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startReordering] = useTransition();
  // Shared by the partner dropdown, the parent whip, and branch drops — all
  // just add/swap a relationship edge and refresh.
  const [isLinking, startLinking] = useTransition();

  // Checkbox selection for "Create branch": scoped to one generation at a
  // time — checking a row in a different section starts a fresh selection
  // there. Capped at two, since a branch always has exactly two parents.
  const [selection, setSelection] = useState<{ group: string; ids: string[] } | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchDropTargetId, setBranchDropTargetId] = useState<string | null>(null);

  function toggleSelect(group: string, personId: string) {
    setSelection((prev) => {
      if (!prev || prev.group !== group) return { group, ids: [personId] };
      if (prev.ids.includes(personId)) {
        const ids = prev.ids.filter((id) => id !== personId);
        return ids.length ? { group, ids } : null;
      }
      if (prev.ids.length >= 2) return prev;
      return { group, ids: [...prev.ids, personId] };
    });
  }

  function handleCreateBranch(group: string) {
    if (!selection || selection.group !== group || selection.ids.length !== 2) return;
    const [aId, bId] = selection.ids;
    const a = personById.get(aId);
    const b = personById.get(bId);
    if (!a || !b) return;
    setBranches((prev) => [
      ...prev,
      { id: crypto.randomUUID(), groupLabel: group, label: `${a.full_name} & ${b.full_name}`, parentIds: [aId, bId] },
    ]);
    setSelection(null);
  }

  // Everyone already linked as a child of both of a branch's two parents —
  // shown inside the branch so drops so far are visible.
  function childrenOfBranch(branch: Branch): Person[] {
    const [a, b] = branch.parentIds;
    const hasParent = (parentId: string) =>
      new Set(
        relationships
          .filter((r) => r.type === "parent" && r.related_person_id === parentId)
          .map((r) => r.person_id),
      );
    const withA = hasParent(a);
    const withB = hasParent(b);
    return persons.filter((p) => withA.has(p.id) && withB.has(p.id));
  }

  // Generation depth per person (0 = a root), used both to build the
  // Generation N groups below and to scope each row's partner dropdown to
  // people in that same generation.
  const depths = useMemo(() => getGenerationDepths(persons, relationships), [persons, relationships]);

  const baseGroups = useMemo<Group[]>(() => {
    const byDepth = new Map<number, Person[]>();
    for (const p of persons) {
      const d = depths.get(p.id);
      if (d === undefined) continue;
      byDepth.set(d, [...(byDepth.get(d) ?? []), p]);
    }

    const result: Group[] = [...byDepth.entries()]
      .sort(([a], [b]) => a - b)
      .map(([d, people]) => ({ label: `Generation ${d + 1}`, persons: sortPersonsForList(people) }));

    const unconnected = [
      ...getUnconnectedPersons(persons, relationships),
      ...getPlacedUnconnected(persons, relationships),
    ];
    if (unconnected.length > 0) {
      result.push({ label: "Not yet connected", persons: sortPersonsForList(unconnected) });
    }

    return result;
  }, [persons, relationships, depths]);

  // Ordered ids per group, kept in sync with the server-derived order and
  // overridden live while a drag is in progress.
  const [order, setOrder] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setOrder(Object.fromEntries(baseGroups.map((g) => [g.label, g.persons.map((p) => p.id)])));
  }, [baseGroups]);

  const personById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const editingPerson = editingPersonId ? personById.get(editingPersonId) : undefined;

  // Each person's current spouse edge (if any), keyed both directions, for
  // the partner dropdown's selected value and for swapping the edge when it
  // changes.
  const spouseEdgeByPersonId = useMemo(() => {
    const map = new Map<string, { relationshipId: string; otherId: string }>();
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      if (personById.has(r.person_id) && personById.has(r.related_person_id)) {
        map.set(r.person_id, { relationshipId: r.id, otherId: r.related_person_id });
        map.set(r.related_person_id, { relationshipId: r.id, otherId: r.person_id });
      }
    }
    return map;
  }, [relationships, personById]);

  // Candidate partners for a row's dropdown: everyone else at the same
  // generation depth (unconnected people, who have no depth, are matched
  // against other unconnected people instead).
  function sameGenerationCandidates(person: Person): Person[] {
    const d = depths.get(person.id);
    return persons.filter((p) => p.id !== person.id && depths.get(p.id) === d);
  }

  const listRefs = useRef(new Map<string, HTMLUListElement>());
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // A branch's drop zone carries data-branch-id; elementFromPoint finds
  // whatever's visually under the pointer regardless of DOM nesting, so this
  // works no matter which group the drag started in.
  function branchIdAtPoint(clientX: number, clientY: number): string | null {
    return document.elementFromPoint(clientX, clientY)?.closest("[data-branch-id]")?.getAttribute("data-branch-id") ?? null;
  }

  // The grip handle drags via window-level listeners rather than
  // setPointerCapture on the button itself: capture ties the drag to one
  // element, and browsers can silently drop it once the pointer travels over
  // *other* interactive elements along the way (another button, a <select>)
  // — exactly the path a drag toward a branch box or a distant row takes.
  // Listening on window sidesteps that entirely; it doesn't care what's
  // visually under the cursor.
  function handlePointerDown(e: React.PointerEvent, group: string, personId: string) {
    e.preventDefault();
    const pointerId = e.pointerId;
    setDraggingId(personId);
    // Mutable local copy, not React state, so the up-handler always reads
    // the true latest order even though state updates are async.
    let localOrder = order[group] ?? [];

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const branchId = branchIdAtPoint(ev.clientX, ev.clientY);
      setBranchDropTargetId(branchId);
      if (branchId) return; // hovering a branch: skip the reorder-index preview
      const listEl = listRefs.current.get(group);
      if (!listEl) return;
      const rows = Array.from(listEl.children) as HTMLElement[];
      const targetIndex = indexForY(rows, ev.clientY);
      const fromIndex = localOrder.indexOf(personId);
      if (fromIndex === -1 || fromIndex === targetIndex) return;
      const next = [...localOrder];
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, personId);
      localOrder = next;
      setOrder((prev) => ({ ...prev, [group]: next }));
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDraggingId(null);

      // Dropped onto an open branch: add this person as a child of both of
      // the branch's parents instead of reordering.
      const branchId = branchIdAtPoint(ev.clientX, ev.clientY);
      setBranchDropTargetId(null);
      if (branchId) {
        const branch = branches.find((b) => b.id === branchId);
        if (!branch) return;
        setError("");
        startLinking(async () => {
          for (const parentId of branch.parentIds) {
            const result = await connectPersons({
              token,
              personId,
              relatedPersonId: parentId,
              type: "parent",
            });
            if (!result.ok) {
              setError(result.message);
              return;
            }
          }
          router.refresh();
        });
        return;
      }

      setError("");
      startReordering(async () => {
        const result = await reorderPersons({ token, personIds: localOrder });
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.message);
        }
      });
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDraggingId(null);
      setBranchDropTargetId(null);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // Changing a row's partner dropdown: drop the old spouse edge (if any) and
  // add the new one (if a partner was chosen instead of "Single").
  function handleSpouseChange(personId: string, newSpouseId: string) {
    const current = spouseEdgeByPersonId.get(personId);
    if ((current?.otherId ?? "") === newSpouseId) return;
    setError("");
    startLinking(async () => {
      if (current) {
        const disconnectResult = await disconnectPersons({ token, relationshipId: current.relationshipId });
        if (!disconnectResult.ok) {
          setError(disconnectResult.message);
          return;
        }
      }
      if (newSpouseId) {
        const connectResult = await connectPersons({
          token,
          personId,
          relatedPersonId: newSpouseId,
          type: "spouse",
        });
        if (!connectResult.ok) {
          setError(connectResult.message);
          return;
        }
      }
      router.refresh();
    });
  }

  // The person row under a screen point, excluding the whip's own row. Rows
  // carry data-person-id; the whip overlay is pointer-events-none so it
  // never shadows them.
  function rowIdAtPoint(clientX: number, clientY: number, excludeId: string): string | null {
    const row = document.elementFromPoint(clientX, clientY)?.closest("[data-person-id]");
    const id = row?.getAttribute("data-person-id");
    return id && id !== excludeId ? id : null;
  }

  // Same window-listener approach as the grip handle above, for the same
  // reason: the whip is dragged across many other rows and controls, and
  // setPointerCapture doesn't reliably survive that trip in every browser.
  function handleParentWhipDown(e: React.PointerEvent<HTMLButtonElement>, personId: string) {
    e.preventDefault();
    const pointerId = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    setWhip({ fromId: personId, originX, originY, x: originX, y: originY });
    setWhipTargetId(null);

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      setWhip((w) => (w ? { ...w, x: ev.clientX, y: ev.clientY } : w));
      setWhipTargetId(rowIdAtPoint(ev.clientX, ev.clientY, personId));
    }

    // Releasing the whip over a row adds a parent edge — the row the whip
    // started from becomes the child, the row it's dropped on becomes the
    // parent. A child can have more than one parent, so this only ever adds
    // an edge; it never removes one.
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      const parentId = rowIdAtPoint(ev.clientX, ev.clientY, personId);
      setWhip(null);
      setWhipTargetId(null);
      if (!parentId) return;
      setError("");
      startLinking(async () => {
        const result = await connectPersons({
          token,
          personId,
          relatedPersonId: parentId,
          type: "parent",
        });
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.message);
        }
      });
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setWhip(null);
      setWhipTargetId(null);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  if (persons.length === 0) {
    return (
      <p className="p-6 text-sm text-stone-600">
        This tree is empty. Share the link so family can join, or add relatives.
      </p>
    );
  }

  return (
    <div className="space-y-5 pl-20">
      {baseGroups.map((group) => {
        const ids = order[group.label] ?? group.persons.map((p) => p.id);
        const groupBranches = branches.filter((b) => b.groupLabel === group.label);
        return (
          <Fragment key={group.label}>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {group.label}
            </h2>
            <ul
              ref={(el) => {
                if (el) listRefs.current.set(group.label, el);
                else listRefs.current.delete(group.label);
              }}
              className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white"
            >
              {ids.map((id) => {
                const person = personById.get(id);
                if (!person) return null;
                return (
                  <li
                    key={person.id}
                    data-person-id={person.id}
                    className={`flex items-center ${
                      draggingId === person.id ? "relative z-10 bg-stone-50 shadow-md" : ""
                    } ${
                      whip?.fromId === person.id
                        ? "bg-blue-50"
                        : whipTargetId === person.id
                          ? "bg-blue-100"
                          : ""
                    }`}
                  >
                    <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2">
                      {isOwner && (
                        <input
                          type="checkbox"
                          checked={selection?.group === group.label && selection.ids.includes(person.id)}
                          onChange={() => toggleSelect(group.label, person.id)}
                          aria-label={`Select ${person.full_name}`}
                          className="h-4 w-4 shrink-0 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      )}
                      <PersonAvatar
                        name={person.full_name}
                        photoUrl={person.photo_url}
                        gender={person.gender}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-900">
                          {person.full_name}
                        </p>
                        <p className="truncate text-xs text-stone-600">{person.chinese_name}</p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-3 w-3 shrink-0 text-rose-500"
                            aria-hidden="true"
                          >
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                          {isOwner ? (
                            <select
                              value={spouseEdgeByPersonId.get(person.id)?.otherId ?? ""}
                              onChange={(e) => handleSpouseChange(person.id, e.target.value)}
                              disabled={isLinking}
                              aria-label={`${person.full_name}'s partner`}
                              className="min-h-6 max-w-full rounded border border-rose-200 bg-rose-50 px-1 py-0.5 text-xs font-medium text-rose-700 disabled:opacity-50"
                            >
                              <option value="">Single</option>
                              {sameGenerationCandidates(person).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.full_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="truncate text-xs text-rose-600">
                              {personById.get(spouseEdgeByPersonId.get(person.id)?.otherId ?? "")
                                ?.full_name ?? "Single"}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        type="button"
                        aria-label={`Drag onto another person to set ${person.full_name}'s parent`}
                        disabled={isLinking}
                        onPointerDown={(e) => handleParentWhipDown(e, person.id)}
                        style={{ touchAction: "none" }}
                        className={`flex h-11 w-9 shrink-0 cursor-crosshair items-center justify-center disabled:opacity-50 ${
                          whip?.fromId === person.id ? "text-blue-600" : "text-stone-300"
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        aria-label={`Edit ${person.full_name}`}
                        onClick={() => setEditingPersonId(person.id)}
                        className="flex h-11 w-9 shrink-0 items-center justify-center text-stone-400"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
                        </svg>
                      </button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        aria-label={`Reorder ${person.full_name}`}
                        onPointerDown={(e) => handlePointerDown(e, group.label, person.id)}
                        style={{ touchAction: "none" }}
                        className="flex h-11 w-9 shrink-0 cursor-grab items-center justify-center text-stone-400 active:cursor-grabbing"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="h-4 w-4"
                        >
                          <circle cx="9" cy="5" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="9" cy="19" r="1.5" />
                          <circle cx="15" cy="5" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="15" cy="19" r="1.5" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {selection?.group === group.label && selection.ids.length === 2 && (
              <button
                type="button"
                onClick={() => handleCreateBranch(group.label)}
                className="mt-2 min-h-9 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Create branch
              </button>
            )}
          </section>
          {groupBranches.map((branch) => {
            const kids = childrenOfBranch(branch);
            return (
              <div
                key={branch.id}
                data-branch-id={branch.id}
                className={`mt-2 rounded-xl border-2 border-dashed p-3 transition-colors ${
                  branchDropTargetId === branch.id
                    ? "border-emerald-500 bg-emerald-100"
                    : "border-emerald-300 bg-emerald-50"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-emerald-900">{branch.label}</h3>
                  <button
                    type="button"
                    onClick={() => setBranches((prev) => prev.filter((b) => b.id !== branch.id))}
                    aria-label={`Close ${branch.label} branch`}
                    className="min-h-8 min-w-8 shrink-0 text-emerald-700"
                  >
                    ×
                  </button>
                </div>
                <ul className="divide-y divide-emerald-100 overflow-hidden rounded-lg border border-emerald-200 bg-white">
                  {kids.map((kid) => (
                    <li key={kid.id} className="flex items-center gap-3 px-3 py-2">
                      <PersonAvatar name={kid.full_name} photoUrl={kid.photo_url} gender={kid.gender} size={28} />
                      <span className="truncate text-sm text-stone-800">{kid.full_name}</span>
                    </li>
                  ))}
                  {kids.length === 0 && (
                    <li className="px-3 py-3 text-center text-xs text-emerald-700">
                      Drag a row&apos;s grip handle here to add them as a child
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
          </Fragment>
        );
      })}

      {whip && (
        <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden="true">
          <path
            d={whipPath(whip)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
          <circle cx={whip.originX} cy={whip.originY} r={3} fill="#2563eb" />
          <circle cx={whip.x} cy={whip.y} r={5} fill="#2563eb" />
        </svg>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {editingPerson && (
        <AddRelativeForm
          key={editingPerson.id}
          token={token}
          person={editingPerson}
          persons={persons}
          relationships={relationships}
          open
          onOpenChange={(next) => {
            if (!next) setEditingPersonId(null);
          }}
        />
      )}
    </div>
  );
}
