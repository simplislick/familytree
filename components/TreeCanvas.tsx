"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeLayout,
  getPlacedUnconnected,
  getUnconnectedPersons,
  snapToGrid,
  AVATAR_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutEdge,
  type LayoutNode,
} from "@/lib/tree-layout";
import { disconnectPersons, movePerson, placePerson } from "@/lib/actions";
import AddRelativeForm from "./AddRelativeForm";
import PersonAvatar, { GENDER_COLORS } from "./PersonAvatar";
import PersonCard from "./PersonCard";
import type { JoinRelation, Person, RelationType, Relationship } from "@/lib/types";

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const TAP_TOLERANCE_PX = 6;
const HANDLE_WIDTH = 28;

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "Child of",
  spouse: "Spouse of",
  parent: "Parent of",
};

type View = { x: number; y: number; scale: number };
type Drag = { personId: string; name: string; photoUrl: string | null; x: number; y: number };
type ConnectPrompt = { personId: string; personName: string; anchorId: string; anchorName: string };
type DisconnectPrompt = { relationshipId: string; aName: string; bName: string; type: RelationType };
type Point = { id: string; x: number; y: number };

// Radial node canvas: pan by dragging, zoom with the scroll wheel or pinch,
// tap a person for their details card. Connected people are laid out
// automatically as a circular pedigree; a left-side drawer holds everyone
// else — drag one straight onto the canvas to drop them at a grid-snapped
// spot (they stay draggable from there), or onto an existing node to connect
// them for the first time. Click an existing connector line to remove that
// relationship; adding relationships happens in a person's details card
// (the Family section).
export default function TreeCanvas({
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
  const layout = useMemo(() => computeLayout(persons, relationships), [persons, relationships]);
  const unconnected = useMemo(
    () => getUnconnectedPersons(persons, relationships),
    [persons, relationships],
  );
  const freeform = useMemo(
    () => getPlacedUnconnected(persons, relationships),
    [persons, relationships],
  );
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [connectPrompt, setConnectPrompt] = useState<ConnectPrompt | null>(null);
  const [connectError, setConnectError] = useState("");
  const [disconnectPrompt, setDisconnectPrompt] = useState<DisconnectPrompt | null>(null);
  const [disconnectError, setDisconnectError] = useState("");
  const [isConnecting, startConnecting] = useTransition();
  const [isDisconnecting, startDisconnecting] = useTransition();
  const [, startPlacing] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);

  // Fit the whole radial tree in the viewport once on mount — the circle's
  // center is nowhere near (0, 0), so the default view would show a corner.
  const didFitView = useRef(false);
  useEffect(() => {
    if (didFitView.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || layout.width === 0 || layout.height === 0) return;
    const margin = 48;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min((rect.width - margin) / layout.width, (rect.height - margin) / layout.height, 1),
      ),
    );
    setView({
      scale,
      x: (rect.width - layout.width * scale) / 2,
      y: (rect.height - layout.height * scale) / 2,
    });
    didFitView.current = true;
  }, [layout]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const panned = useRef(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);

  const nodeById = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    layout.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [layout]);

  const personById = useMemo(() => {
    const map = new Map<string, Person>();
    persons.forEach((p) => map.set(p.id, p));
    return map;
  }, [persons]);

  // Every node actually rendered on the canvas right now (pedigree +
  // freeform), used for hit-testing drops and sizing the SVG.
  const canvasPoints = useMemo<Point[]>(() => {
    const freeformPoints = freeform.map((p) => ({
      id: p.id,
      x: p.position_x ?? 0,
      y: p.position_y ?? 0,
    }));
    return [...layout.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })), ...freeformPoints];
  }, [layout, freeform]);

  const svgWidth = Math.max(layout.width, ...canvasPoints.map((p) => p.x + NODE_WIDTH), 1);
  const svgHeight = Math.max(layout.height, ...canvasPoints.map((p) => p.y + NODE_HEIGHT), 1);

  if (persons.length === 0) {
    return (
      <p className="p-6 text-sm text-stone-600">
        This tree is empty. Share the link so family can join, or add relatives.
      </p>
    );
  }

  function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const scale = clampScale(v.scale * (e.deltaY < 0 ? 1.1 : 0.9));
      // Keep the point under the cursor stationary while zooming.
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      tapStart.current = { x: e.clientX, y: e.clientY };
      panned.current = false;
    } else {
      tapStart.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (
        tapStart.current &&
        Math.hypot(e.clientX - tapStart.current.x, e.clientY - tapStart.current.y) >
          TAP_TOLERANCE_PX
      ) {
        panned.current = true;
      }
      if (panned.current) {
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current && dist > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left;
        const cy = (a.y + b.y) / 2 - rect.top;
        setView((v) => {
          const scale = clampScale(v.scale * (dist / pinchDistance.current!));
          const k = scale / v.scale;
          return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
        });
      }
      pinchDistance.current = dist;
      panned.current = true;
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
  }

  function handleNodeClick(personId: string) {
    if (panned.current) return; // it was a pan, not a tap
    setSelectedId(personId);
  }

  // Converts a screen point into the canvas's local (pre-pan/zoom) coordinate
  // space — the same space layout.nodes and freeform positions live in.
  function toLocalPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  }

  function isWithinCanvas(clientX: number, clientY: number): boolean {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  // Hit-tests a screen point against every rendered node, excluding the node
  // currently being dragged (so repositioning one doesn't "connect" it to
  // its own old spot).
  function hitTest(clientX: number, clientY: number, excludeId?: string): string | null {
    if (!isWithinCanvas(clientX, clientY)) return null;
    const local = toLocalPoint(clientX, clientY);
    if (!local) return null;
    const hit = canvasPoints.find(
      (n) =>
        n.id !== excludeId &&
        local.x >= n.x &&
        local.x <= n.x + NODE_WIDTH &&
        local.y >= n.y &&
        local.y <= n.y + NODE_HEIGHT,
    );
    return hit?.id ?? null;
  }

  function handleDragStart(
    e: React.PointerEvent<Element>,
    personId: string,
    name: string,
    photoUrl: string | null,
  ) {
    // Stops the pan layer underneath from also starting a canvas pan when
    // the drag begins on an already-placed node sitting in the canvas.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
    setDrag({ personId, name, photoUrl, x: e.clientX, y: e.clientY });
    setHoverTargetId(null);
  }

  function handleDragMove(e: React.PointerEvent<Element>) {
    if (!drag) return;
    e.stopPropagation();
    if (
      dragOrigin.current &&
      Math.hypot(e.clientX - dragOrigin.current.x, e.clientY - dragOrigin.current.y) >
        TAP_TOLERANCE_PX
    ) {
      dragMoved.current = true;
    }
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setHoverTargetId(dragMoved.current ? hitTest(e.clientX, e.clientY, drag.personId) : null);
  }

  function handleDragEnd(e: React.PointerEvent<Element>) {
    if (!drag) return;
    e.stopPropagation();
    const dragged = drag;
    const moved = dragMoved.current;
    const targetId = moved ? hitTest(e.clientX, e.clientY, dragged.personId) : null;
    const droppedOnCanvas = moved && !targetId && isWithinCanvas(e.clientX, e.clientY);
    const dropLocal = droppedOnCanvas ? toLocalPoint(e.clientX, e.clientY) : null;
    setDrag(null);
    setHoverTargetId(null);

    if (!moved) {
      // A plain tap, not a drag: open the same detail card tapping a tree
      // node would show.
      setSelectedId(dragged.personId);
      return;
    }
    if (targetId) {
      const anchor = personById.get(targetId);
      if (!anchor) return;
      setConnectError("");
      setConnectPrompt({
        personId: dragged.personId,
        personName: dragged.name,
        anchorId: targetId,
        anchorName: anchor.full_name,
      });
      return;
    }
    // Dropped on open canvas, not on an existing node: (re)place them at a
    // grid-snapped spot. Works the same whether they're coming from the
    // drawer or being repositioned from an existing spot on the canvas.
    if (dropLocal) {
      const snapped = snapToGrid(dropLocal.x - NODE_WIDTH / 2, dropLocal.y - AVATAR_SIZE / 2);
      startPlacing(async () => {
        const result = await placePerson({ token, personId: dragged.personId, x: snapped.x, y: snapped.y });
        if (result.ok) router.refresh();
      });
    }
  }

  function handleConnect(relation: JoinRelation) {
    if (!connectPrompt) return;
    setConnectError("");
    startConnecting(async () => {
      const result = await movePerson({
        token,
        personId: connectPrompt.personId,
        anchorPersonId: connectPrompt.anchorId,
        relation,
      });
      if (result.ok) {
        setConnectPrompt(null);
        router.refresh();
      } else {
        setConnectError(result.message);
      }
    });
  }

  function handleEdgeClick(e: React.MouseEvent, edge: LayoutEdge) {
    e.stopPropagation();
    const a = personById.get(edge.from);
    const b = personById.get(edge.to);
    if (!a || !b) return;
    setDisconnectError("");
    setDisconnectPrompt({ relationshipId: edge.id, aName: a.full_name, bName: b.full_name, type: edge.type });
  }

  function handleDisconnect() {
    if (!disconnectPrompt) return;
    setDisconnectError("");
    startDisconnecting(async () => {
      const result = await disconnectPersons({ token, relationshipId: disconnectPrompt.relationshipId });
      if (result.ok) {
        setDisconnectPrompt(null);
        router.refresh();
      } else {
        setDisconnectError(result.message);
      }
    });
  }

  const selected = selectedId ? personById.get(selectedId) : undefined;
  const editingPerson = editingPersonId ? personById.get(editingPersonId) : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-[70vh] min-h-96 w-full touch-none overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <svg width={svgWidth} height={svgHeight} style={{ overflow: "visible" }}>
            {layout.edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const isHovered = hoverEdgeId === e.id;
              const stroke = isHovered ? "#dc2626" : "#57534e";
              if (e.type === "spouse") {
                const x1 = from.x + NODE_WIDTH / 2;
                const y1 = from.y + AVATAR_SIZE / 2;
                const x2 = to.x + NODE_WIDTH / 2;
                const y2 = to.y + AVATAR_SIZE / 2;
                return (
                  <g
                    key={e.id}
                    className="cursor-pointer"
                    onClick={(ev) => handleEdgeClick(ev, e)}
                    onPointerEnter={() => setHoverEdgeId(e.id)}
                    onPointerLeave={() => setHoverEdgeId(null)}
                  >
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2} />
                  </g>
                );
              }
              // Parent edge: radial elbow (out from the parent, arc to the
              // child's angle, out to the child) precomputed by the layout so
              // the tree reads as a circular dendrogram; straight line as a
              // defensive fallback if a path wasn't computed.
              const d =
                e.path ||
                `M ${from.x + NODE_WIDTH / 2} ${from.y + AVATAR_SIZE} L ${to.x + NODE_WIDTH / 2} ${to.y}`;
              return (
                <g
                  key={e.id}
                  className="cursor-pointer"
                  onClick={(ev) => handleEdgeClick(ev, e)}
                  onPointerEnter={() => setHoverEdgeId(e.id)}
                  onPointerLeave={() => setHoverEdgeId(null)}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                  <path d={d} fill="none" stroke={stroke} strokeWidth={2} />
                </g>
              );
            })}
            {layout.nodes.map((n) => {
              const person = personById.get(n.id);
              if (!person) return null;
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                  <AvatarNode
                    person={person}
                    isDropTarget={hoverTargetId === n.id}
                    isSelected={selectedId === n.id}
                    onClick={() => handleNodeClick(n.id)}
                  />
                </g>
              );
            })}
            {freeform.map((p) => {
              const x = p.position_x ?? 0;
              const y = p.position_y ?? 0;
              return (
                <g key={p.id} transform={`translate(${x}, ${y})`}>
                  <AvatarNode
                    person={p}
                    dashed
                    isDropTarget={hoverTargetId === p.id}
                    isSelected={selectedId === p.id}
                    onPointerDown={(e) => handleDragStart(e, p.id, p.full_name, p.photo_url)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={() => {
                      setDrag(null);
                      setHoverTargetId(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {canvasPoints.length === 0 && unconnected.length > 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-stone-600">
          Open the drawer and drag someone onto the canvas to start the tree.
        </p>
      )}

      {unconnected.length > 0 && (
        <div
          className="absolute inset-y-0 left-0 z-[5] flex rounded-r-xl border-r border-stone-200 bg-white shadow-[4px_0_16px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-out"
          style={{
            width: "min(130px, 35%)",
            transform: drawerOpen ? "translateX(0)" : `translateX(calc(-100% + ${HANDLE_WIDTH}px))`,
          }}
        >
          <ul className="flex-1 space-y-3 overflow-y-auto p-3">
            {unconnected.map((p) => (
              <li key={p.id}>
                <PersonTile
                  person={p}
                  dashed
                  onPointerDown={(e) => handleDragStart(e, p.id, p.full_name, p.photo_url)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={() => {
                    setDrag(null);
                    setHoverTargetId(null);
                  }}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? "Collapse unconnected members" : "Expand unconnected members"}
            className="flex w-7 shrink-0 items-center justify-center border-l border-stone-200 text-stone-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 transition-transform ${drawerOpen ? "" : "rotate-180"}`}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      )}

      {drag && (
        <div
          className="pointer-events-none fixed z-30 flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-sm font-medium text-white shadow-xl"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          <PersonAvatar name={drag.name} photoUrl={drag.photoUrl} size={20} />
          {drag.name}
        </div>
      )}

      {connectPrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (isConnecting ? null : setConnectPrompt(null))}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xs space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-semibold">
              Connect {connectPrompt.personName} to {connectPrompt.anchorName}
            </h3>
            <div className="grid gap-2">
              {(Object.keys(RELATION_LABELS) as JoinRelation[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={isConnecting}
                  onClick={() => handleConnect(r)}
                  className="min-h-11 rounded-lg border border-stone-300 px-3 py-2 text-left text-sm font-medium disabled:opacity-50"
                >
                  {RELATION_LABELS[r]} {connectPrompt.anchorName}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isConnecting}
              onClick={() => setConnectPrompt(null)}
              className="min-h-11 w-full rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
            >
              Cancel
            </button>
            {connectError && <p className="text-sm text-red-700">{connectError}</p>}
          </div>
        </div>
      )}

      {disconnectPrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (isDisconnecting ? null : setDisconnectPrompt(null))}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xs space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-semibold">
              Disconnect {disconnectPrompt.aName} and {disconnectPrompt.bName}?
            </h3>
            <p className="text-sm text-stone-600">
              This removes the {disconnectPrompt.type === "spouse" ? "spouse" : "parent-child"} connection
              between them.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={() => setDisconnectPrompt(null)}
                className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {disconnectError && <p className="text-sm text-red-700">{disconnectError}</p>}
          </div>
        </div>
      )}

      {selected && (
        <PersonCard
          key={selected.id}
          token={token}
          person={selected}
          persons={persons}
          relationships={relationships}
          isOwner={isOwner}
          onEdit={() => {
            setSelectedId(null);
            setEditingPersonId(selected.id);
          }}
          onClose={() => setSelectedId(null)}
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

// Circular avatar + name (+ birth year) below it, used for both pedigree
// nodes (tap to open, positioned by the layout algorithm) and freeform nodes
// (tap to open, drag to reposition or connect — pointer handlers passed in).
function AvatarNode({
  person,
  isDropTarget,
  isSelected,
  dashed,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  person: Person;
  isDropTarget: boolean;
  isSelected: boolean;
  dashed?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGGElement>) => void;
  onPointerCancel?: () => void;
}) {
  const ringColor = isDropTarget
    ? "#3b82f6"
    : isSelected
      ? "#292524"
      : person.user_id
        ? "#86efac"
        : "#9ca3af";
  const cx = NODE_WIDTH / 2;
  const cr = AVATAR_SIZE / 2;
  const clipId = `avatar-clip-${person.id}`;

  return (
    <g
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="cursor-pointer touch-none"
    >
      {person.photo_url ? (
        <>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cr} r={cr} />
          </clipPath>
          <image
            href={person.photo_url}
            x={cx - cr}
            y={0}
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : (
        <>
          <circle cx={cx} cy={cr} r={cr} fill={person.gender ? GENDER_COLORS[person.gender] : "#e7e5e4"} />
          <text
            x={cx}
            y={cr}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={AVATAR_SIZE * 0.34}
            fontWeight={600}
            fill={person.gender ? "#1c1917" : "#78716c"}
          >
            {initials(person.full_name)}
          </text>
        </>
      )}
      <circle
        cx={cx}
        cy={cr}
        r={cr}
        fill="none"
        stroke={ringColor}
        strokeWidth={isDropTarget || isSelected ? 3 : 2}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      {person.gender && (
        <circle
          cx={cx}
          cy={cr}
          r={cr + 3}
          fill="none"
          stroke={GENDER_COLORS[person.gender]}
          strokeWidth={3}
        />
      )}
      <text
        x={cx}
        y={AVATAR_SIZE + 16}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={600}
        fill="#1c1917"
      >
        {truncate(person.full_name, 16)}
      </text>
      {person.birth_date && (
        <text
          x={cx}
          y={AVATAR_SIZE + 32}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="#57534e"
        >
          b. {person.birth_date.slice(0, 4)}
        </text>
      )}
    </g>
  );
}

// Portrait (3:4) photo card used for the unconnected-members drawer.
// Pointer handlers drive the same drag-to-place/drag-to-connect flow as
// on-canvas nodes.
function PersonTile({
  person,
  dashed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  person: Person;
  dashed?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ aspectRatio: "3 / 4" }}
      className={`flex w-full touch-none flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border bg-white p-2 active:bg-stone-50 ${
        dashed ? "border-dashed border-stone-300" : "border-stone-200"
      }`}
    >
      <div
        style={{
          backgroundColor: !person.photo_url && person.gender ? GENDER_COLORS[person.gender] : undefined,
          boxShadow: person.photo_url && person.gender ? `0 0 0 3px ${GENDER_COLORS[person.gender]}` : undefined,
        }}
        className={`aspect-square w-4/5 min-h-0 shrink overflow-hidden rounded-full ${
          person.gender ? "" : "bg-stone-100"
        }`}
      >
        {person.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center text-lg font-semibold ${
              person.gender ? "text-stone-900" : "text-stone-500"
            }`}
          >
            {initials(person.full_name)}
          </div>
        )}
      </div>
      <div className="w-full shrink-0 text-center">
        <p className="truncate text-sm font-medium text-stone-900">{person.full_name}</p>
        {person.birth_date && <p className="text-xs text-stone-600">b. {person.birth_date.slice(0, 4)}</p>}
      </div>
    </button>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}
