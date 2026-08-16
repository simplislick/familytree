"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeLayout,
  getUnconnectedPersons,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutNode,
} from "@/lib/tree-layout";
import { movePerson } from "@/lib/actions";
import PersonCard from "./PersonCard";
import type { JoinRelation, Person, Relationship } from "@/lib/types";

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const TAP_TOLERANCE_PX = 6;
const HANDLE_WIDTH = 44;

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "Child of",
  spouse: "Spouse of",
  parent: "Parent of",
};

type View = { x: number; y: number; scale: number };
type Drag = { personId: string; name: string; x: number; y: number };
type ConnectPrompt = { personId: string; personName: string; anchorId: string; anchorName: string };

// Touch-friendly SVG pedigree viewer: pan by dragging, zoom with the scroll
// wheel or pinch, tap a person for their details card. A left-side drawer
// holds unconnected people; drag one onto a tree node to place them.
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
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [connectPrompt, setConnectPrompt] = useState<ConnectPrompt | null>(null);
  const [connectError, setConnectError] = useState("");
  const [isConnecting, startConnecting] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
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

  // Hit-tests a screen point against tree nodes, in the canvas's local
  // (pre-pan/zoom) coordinate space.
  function hitTestNode(clientX: number, clientY: number): string | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const localX = (clientX - rect.left - view.x) / view.scale;
    const localY = (clientY - rect.top - view.y) / view.scale;
    const hit = layout.nodes.find(
      (n) => localX >= n.x && localX <= n.x + NODE_WIDTH && localY >= n.y && localY <= n.y + NODE_HEIGHT,
    );
    return hit?.id ?? null;
  }

  function handleDragStart(e: React.PointerEvent<HTMLButtonElement>, personId: string, name: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
    setDrag({ personId, name, x: e.clientX, y: e.clientY });
    setHoverTargetId(null);
  }

  function handleDragMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    if (
      dragOrigin.current &&
      Math.hypot(e.clientX - dragOrigin.current.x, e.clientY - dragOrigin.current.y) >
        TAP_TOLERANCE_PX
    ) {
      dragMoved.current = true;
    }
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setHoverTargetId(dragMoved.current ? hitTestNode(e.clientX, e.clientY) : null);
  }

  function handleDragEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dragged = drag;
    const moved = dragMoved.current;
    const targetId = moved ? hitTestNode(e.clientX, e.clientY) : null;
    setDrag(null);
    setHoverTargetId(null);

    if (!moved) {
      // A plain tap, not a drag: open the same detail card tapping a tree
      // node would show.
      setSelectedId(dragged.personId);
      return;
    }
    if (!targetId) return;
    const anchor = personById.get(targetId);
    if (!anchor) return;
    setConnectError("");
    setConnectPrompt({
      personId: dragged.personId,
      personName: dragged.name,
      anchorId: targetId,
      anchorName: anchor.full_name,
    });
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

  const selected = selectedId ? personById.get(selectedId) : undefined;

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
          <svg width={layout.width} height={layout.height}>
            {layout.edges.map((e, i) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              if (e.type === "spouse") {
                return (
                  <line
                    key={`s-${i}`}
                    x1={from.x + NODE_WIDTH / 2}
                    y1={from.y + NODE_HEIGHT / 2}
                    x2={to.x + NODE_WIDTH / 2}
                    y2={to.y + NODE_HEIGHT / 2}
                    stroke="#78716c"
                    strokeWidth={2}
                  />
                );
              }
              // Parent edge: elbow from the parent's bottom to the child's top.
              const x1 = from.x + NODE_WIDTH / 2;
              const y1 = from.y + NODE_HEIGHT;
              const x2 = to.x + NODE_WIDTH / 2;
              const y2 = to.y;
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={`p-${i}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="#78716c"
                  strokeWidth={2}
                />
              );
            })}
            {layout.nodes.map((n) => {
              const person = personById.get(n.id);
              if (!person) return null;
              const isDropTarget = hoverTargetId === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onClick={() => handleNodeClick(n.id)}
                  className="cursor-pointer"
                >
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={10}
                    fill={isDropTarget ? "#eff6ff" : person.user_id ? "#f0fdf4" : "#ffffff"}
                    stroke={isDropTarget ? "#3b82f6" : selectedId === n.id ? "#292524" : "#d6d3d1"}
                    strokeWidth={isDropTarget || selectedId === n.id ? 2.5 : 1.5}
                  />
                  <text
                    x={NODE_WIDTH / 2}
                    y={NODE_HEIGHT / 2 - 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill="#1c1917"
                  >
                    {truncate(person.full_name, 18)}
                  </text>
                  {person.birth_date && (
                    <text
                      x={NODE_WIDTH / 2}
                      y={NODE_HEIGHT / 2 + 14}
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
            })}
          </svg>
        </div>
      </div>

      {layout.nodes.length === 0 && unconnected.length > 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-stone-600">
          No one is connected yet — open the drawer and drag someone in.
        </p>
      )}

      {unconnected.length > 0 && (
        <div
          className="absolute inset-y-0 left-0 z-[5] flex rounded-r-xl border-r border-stone-200 bg-white shadow-[4px_0_16px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-out"
          style={{
            width: "min(260px, 70%)",
            transform: drawerOpen ? "translateX(0)" : `translateX(calc(-100% + ${HANDLE_WIDTH}px))`,
          }}
        >
          <ul className="flex-1 space-y-2 overflow-y-auto p-3">
            {unconnected.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onPointerDown={(e) => handleDragStart(e, p.id, p.full_name)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={() => {
                    setDrag(null);
                    setHoverTargetId(null);
                  }}
                  className="flex min-h-11 w-full touch-none items-center justify-between rounded-lg border border-dashed border-stone-300 bg-white px-3 py-2 text-left text-sm active:bg-stone-50"
                >
                  <span className="font-medium text-stone-900">{p.full_name}</span>
                  {p.birth_date && (
                    <span className="text-xs text-stone-600">b. {p.birth_date.slice(0, 4)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? "Collapse unconnected members" : "Expand unconnected members"}
            className="flex w-11 shrink-0 flex-col items-center justify-center gap-2 border-l border-stone-200 text-stone-700"
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
            <span
              className="whitespace-nowrap text-xs font-medium"
              style={{ writingMode: "vertical-rl" }}
            >
              Not connected ({unconnected.length})
            </span>
          </button>
        </div>
      )}

      {drag && (
        <div
          className="pointer-events-none fixed z-30 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-sm font-medium text-white shadow-xl"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
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

      {selected && (
        <PersonCard
          token={token}
          person={selected}
          persons={persons}
          isOwner={isOwner}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
