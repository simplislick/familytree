"use client";

import { useMemo, useRef, useState } from "react";
import {
  computeLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutNode,
} from "@/lib/tree-layout";
import PersonCard from "./PersonCard";
import type { Person, Relationship } from "@/lib/types";

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const TAP_TOLERANCE_PX = 6;

type View = { x: number; y: number; scale: number };

// Touch-friendly SVG pedigree viewer: pan by dragging, zoom with the scroll
// wheel or pinch, tap a person for their details card.
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
  const layout = useMemo(() => computeLayout(persons, relationships), [persons, relationships]);
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const panned = useRef(false);

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
      <p className="p-6 text-sm text-stone-500">
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

  const selected = selectedId ? personById.get(selectedId) : undefined;

  return (
    <div className="relative h-[70vh] min-h-96 w-full touch-none overflow-hidden rounded-xl border border-stone-200 bg-white">
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
                    stroke="#a8a29e"
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
                  stroke="#a8a29e"
                  strokeWidth={2}
                />
              );
            })}
            {layout.nodes.map((n) => {
              const person = personById.get(n.id);
              if (!person) return null;
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
                    fill={person.user_id ? "#f0fdf4" : "#ffffff"}
                    stroke={selectedId === n.id ? "#292524" : "#d6d3d1"}
                    strokeWidth={selectedId === n.id ? 2.5 : 1.5}
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
                      fill="#78716c"
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
