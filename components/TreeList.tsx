"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectPersons, createBranch, deleteBranch, disconnectPersons, reorderPersons } from "@/lib/actions";
import { buildListSections, groupRank, type ListBranch, type ListRowList } from "@/lib/tree-layout";
import AddRelativeForm from "./AddRelativeForm";
import PersonAvatar from "./PersonAvatar";
import type { Branch as StoredBranch, Person, Relationship } from "@/lib/types";

// Render-ready branch and row-list shapes, shared with the radial graph so
// both views read the same structure.
type Branch = ListBranch;
type RowList = ListRowList;

// Branch colours by generation: Generation 2 branches use the first
// palette, Generation 3 the next, and so on, cycling after the last. Full
// class strings (not built from a colour name) so Tailwind can see them.
const BRANCH_PALETTES = [
  {
    box: "border-emerald-300 bg-emerald-50",
    boxDrop: "border-emerald-500 bg-emerald-100",
    list: "divide-emerald-100 border-emerald-200",
    title: "text-emerald-900",
    muted: "text-emerald-700",
    button: "border-emerald-300 text-emerald-800",
  },
  {
    box: "border-sky-300 bg-sky-50",
    boxDrop: "border-sky-500 bg-sky-100",
    list: "divide-sky-100 border-sky-200",
    title: "text-sky-900",
    muted: "text-sky-700",
    button: "border-sky-300 text-sky-800",
  },
  {
    box: "border-amber-300 bg-amber-50",
    boxDrop: "border-amber-500 bg-amber-100",
    list: "divide-amber-100 border-amber-200",
    title: "text-amber-900",
    muted: "text-amber-700",
    button: "border-amber-300 text-amber-800",
  },
  {
    box: "border-violet-300 bg-violet-50",
    boxDrop: "border-violet-500 bg-violet-100",
    list: "divide-violet-100 border-violet-200",
    title: "text-violet-900",
    muted: "text-violet-700",
    button: "border-violet-300 text-violet-800",
  },
  {
    box: "border-rose-300 bg-rose-50",
    boxDrop: "border-rose-500 bg-rose-100",
    list: "divide-rose-100 border-rose-200",
    title: "text-rose-900",
    muted: "text-rose-700",
    button: "border-rose-300 text-rose-800",
  },
];

function branchPalette(sectionLabel: string) {
  const n = groupRank(sectionLabel);
  const i = Number.isFinite(n) ? Math.max(0, n - 2) % BRANCH_PALETTES.length : 0;
  return BRANCH_PALETTES[i];
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
// inline via a dropdown scoped to that person's own generation; children
// are linked to their parents through branches. The owner can also drag the
// grip handle to reorder people within a list — order is saved as each person's `list_order` so
// it's shared with everyone viewing the tree. Tapping the pencil opens the
// full edit form.
export default function TreeList({
  token,
  persons,
  relationships,
  branches: storedBranches,
  isOwner,
}: {
  token: string;
  persons: Person[];
  relationships: Relationship[];
  branches: StoredBranch[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startReordering] = useTransition();
  // Shared by the partner dropdown, branch drops, and branch create/close — all
  // just add/swap a relationship edge and refresh.
  const [isLinking, startLinking] = useTransition();

  // Tap-a-name selection for "Create branch": scoped to one generation at a
  // time — tapping a row in a different section starts a fresh selection
  // there. Capped at two, since a branch always has exactly two parents; a
  // third tap replaces the older of the two.
  const [selection, setSelection] = useState<{ group: string; ids: string[] } | null>(null);
  const [branchDropTargetId, setBranchDropTargetId] = useState<string | null>(null);
  // Branch whose "Add contact" form is open: a new person created there
  // becomes a child of both of the branch's parents.
  const [addingToBranch, setAddingToBranch] = useState<Branch | null>(null);
  // Generation section whose header "+" form is open. The form's partner
  // picker is scoped to that generation, since a partner is what places a
  // new person there (without one they land in "Not yet connected").
  const [addingToSection, setAddingToSection] = useState<{ label: string; persons: Person[] } | null>(null);

  function toggleSelect(group: string, personId: string) {
    setSelection((prev) => {
      if (!prev || prev.group !== group) return { group, ids: [personId] };
      if (prev.ids.includes(personId)) {
        const ids = prev.ids.filter((id) => id !== personId);
        return ids.length ? { group, ids } : null;
      }
      return { group, ids: [...prev.ids, personId].slice(-2) };
    });
  }

  function handleCreateBranch() {
    if (!selection || selection.ids.length !== 2) return;
    const [aId, bId] = selection.ids;
    setError("");
    startLinking(async () => {
      const result = await createBranch({ token, parentIds: [aId, bId] });
      if (result.ok) {
        setSelection(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleCloseBranch(branchId: string) {
    setError("");
    startLinking(async () => {
      const result = await deleteBranch({ token, branchId });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  // Generation sections, each split into branch lists then everyone else.
  // Built by the same function the radial graph lays itself out from, so the
  // list dictates the tree. `depths` (0 = a root) also scopes each row's
  // partner dropdown to people in that same generation.
  const { sections, branches, depths } = useMemo(
    () => buildListSections(persons, relationships, storedBranches),
    [persons, relationships, storedBranches],
  );

  const personById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const editingPerson = editingPersonId ? personById.get(editingPersonId) : undefined;


  // Ordered ids per list, kept in sync with the server-derived order and
  // overridden live while a drag is in progress.
  const [order, setOrder] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setOrder(
      Object.fromEntries(sections.flatMap((s) => s.lists.map((l) => [l.key, l.persons.map((p) => p.id)]))),
    );
  }, [sections]);

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
  function handlePointerDown(e: React.PointerEvent, listKey: string, personId: string) {
    e.preventDefault();
    const pointerId = e.pointerId;
    setDraggingId(personId);
    // Mutable local copy, not React state, so the up-handler always reads
    // the true latest order even though state updates are async.
    let localOrder = order[listKey] ?? [];

    // The branch under the pointer, ignoring the one this row already sits
    // in — dragging within a branch is just a reorder.
    function targetBranchId(clientX: number, clientY: number): string | null {
      const id = branchIdAtPoint(clientX, clientY);
      return id && `branch:${id}` !== listKey ? id : null;
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const branchId = targetBranchId(ev.clientX, ev.clientY);
      setBranchDropTargetId(branchId);
      if (branchId) return; // hovering a branch: skip the reorder-index preview
      const listEl = listRefs.current.get(listKey);
      if (!listEl) return;
      const rows = Array.from(listEl.children) as HTMLElement[];
      const targetIndex = indexForY(rows, ev.clientY);
      const fromIndex = localOrder.indexOf(personId);
      if (fromIndex === -1 || fromIndex === targetIndex) return;
      const next = [...localOrder];
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, personId);
      localOrder = next;
      setOrder((prev) => ({ ...prev, [listKey]: next }));
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDraggingId(null);

      // Dropped onto an open branch: add this person as a child of both of
      // the branch's parents instead of reordering.
      const branchId = targetBranchId(ev.clientX, ev.clientY);
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

  if (persons.length === 0) {
    return (
      <p className="p-6 text-sm text-stone-600">
        This tree is empty. Share the link so family can join, or add relatives.
      </p>
    );
  }

  // One person row with the full owner toolkit (select, partner, edit,
  // reorder). Shared by branch lists and plain lists alike.
  function renderRow(person: Person, sectionLabel: string, listKey: string) {
    const isSelected = selection?.group === sectionLabel && selection.ids.includes(person.id);
    return (
      <li
        key={person.id}
        className={`flex items-center ${
          draggingId === person.id ? "relative z-10 bg-stone-50 shadow-md" : ""
        } ${isSelected ? "bg-emerald-50 ring-2 ring-inset ring-emerald-500" : ""}`}
      >
        {/* Owner taps anywhere on the avatar/name area to select the row;
            taps on the partner dropdown (or any other control) are left
            alone. The name itself is a button for keyboard access. */}
        <div
          onClick={
            isOwner
              ? (e) => {
                  if ((e.target as HTMLElement).closest("button, select, input")) return;
                  toggleSelect(sectionLabel, person.id);
                }
              : undefined
          }
          className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 ${isOwner ? "cursor-pointer" : ""}`}
        >
          <PersonAvatar
            name={person.full_name}
            photoUrl={person.photo_url}
            gender={person.gender}
            size={40}
          />
          <div className="min-w-0 flex-1">
            {isOwner ? (
              <button
                type="button"
                onClick={() => toggleSelect(sectionLabel, person.id)}
                aria-pressed={isSelected}
                className="block max-w-full truncate text-left text-sm font-medium text-stone-900"
              >
                {person.full_name}
              </button>
            ) : (
              <p className="truncate text-sm font-medium text-stone-900">{person.full_name}</p>
            )}
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
            onPointerDown={(e) => handlePointerDown(e, listKey, person.id)}
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
  }

  function renderList(list: RowList, sectionLabel: string) {
    const ids = order[list.key] ?? list.persons.map((p) => p.id);
    const palette = branchPalette(sectionLabel);
    return (
      <ul
        ref={(el) => {
          if (el) listRefs.current.set(list.key, el);
          else listRefs.current.delete(list.key);
        }}
        className={`divide-y overflow-hidden rounded-xl border bg-white ${
          list.branch ? palette.list : "divide-stone-200 border-stone-200"
        }`}
      >
        {ids.map((id) => {
          const person = personById.get(id);
          return person ? renderRow(person, sectionLabel, list.key) : null;
        })}
        {list.branch && ids.length === 0 && (
          <li className={`px-3 py-3 text-center text-xs ${palette.muted}`}>
            No children yet. Add a child, or drag a row&apos;s grip handle here
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="space-y-5 pt-10">
      {sections.map((section) => (
        <section key={section.label} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {section.label}
            </h2>
            {isOwner && (
              <button
                type="button"
                onClick={() =>
                  setAddingToSection({
                    label: section.label,
                    persons: section.lists.flatMap((l) => l.persons),
                  })
                }
                aria-label={`Add a contact to ${section.label}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg leading-none text-stone-600"
              >
                +
              </button>
            )}
          </div>
          {section.lists.map((list) => {
            const branch = list.branch;
            if (!branch) return <div key={list.key}>{renderList(list, section.label)}</div>;
            const palette = branchPalette(section.label);
            return (
              <div
                key={list.key}
                data-branch-id={branch.id}
                className={`rounded-xl border-2 border-dashed p-2 transition-colors ${
                  branchDropTargetId === branch.id ? palette.boxDrop : palette.box
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2 pl-1">
                  <h3 className={`truncate text-sm font-semibold ${palette.title}`}>
                    Children of {branch.label}
                  </h3>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleCloseBranch(branch.id)}
                      disabled={isLinking}
                      aria-label={`Close ${branch.label} branch`}
                      className={`min-h-8 min-w-8 shrink-0 ${palette.muted}`}
                    >
                      ×
                    </button>
                  )}
                </div>
                {renderList(list, section.label)}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setAddingToBranch(branch)}
                    className={`mt-2 ml-auto block min-h-9 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium ${palette.button}`}
                  >
                    + Add child
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {selection && (
        <div
          role="status"
          className="animate-drop-down fixed left-1/2 top-3 z-30 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm text-white shadow-lg"
        >
          <span className="min-w-0 flex-1">
            {selection.ids.length === 1
              ? "1 contact selected. Select one more to create a branch."
              : "2 contacts selected"}
          </span>
          {selection.ids.length === 2 && (
            <button
              type="button"
              onClick={handleCreateBranch}
              disabled={isLinking}
              className="min-h-9 shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              Create branch
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelection(null)}
            aria-label="Clear selection"
            className="min-h-9 min-w-9 shrink-0 text-stone-300"
          >
            ×
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {addingToBranch && (
        <AddRelativeForm
          key={addingToBranch.id}
          token={token}
          persons={persons}
          relationships={relationships}
          parentIds={addingToBranch.parentIds}
          open
          onOpenChange={(next) => {
            if (!next) setAddingToBranch(null);
          }}
        />
      )}

      {addingToSection && (
        <AddRelativeForm
          key={addingToSection.label}
          token={token}
          persons={addingToSection.label === "Not yet connected" ? persons : addingToSection.persons}
          relationships={relationships}
          open
          onOpenChange={(next) => {
            if (!next) setAddingToSection(null);
          }}
        />
      )}

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
