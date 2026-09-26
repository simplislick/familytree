"use client";

import { useState } from "react";
import Link from "next/link";
import TreeNavbar from "@/components/TreeNavbar";
import TreeCanvas from "@/components/TreeCanvas";
import TreeList from "@/components/TreeList";
import AddRelativeForm from "@/components/AddRelativeForm";
import type { Branch, Person, Relationship } from "@/lib/types";

type View = "graph" | "list";

// Client-side shell for the tree home page: owns the add-relative overlay's
// open state so the navbar's "+" (server-rendered tree above it) can drive it.
export default function TreeHome({
  token,
  treeName,
  shareToken,
  isOwner,
  persons,
  relationships,
  branches,
}: {
  token: string;
  treeName: string;
  shareToken: string;
  isOwner: boolean;
  persons: Person[];
  relationships: Relationship[];
  branches: Branch[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<View>("graph");

  const isGraph = view === "graph";

  return (
    <div className={isGraph ? "flex h-dvh flex-col" : undefined}>
      <TreeNavbar
        token={token}
        treeName={treeName}
        isOwner={isOwner}
        showAdd={isOwner}
        onAddClick={() => setAddOpen(true)}
        shareText={`/t/${shareToken}`}
        showShare={isOwner}
      />

      <main
        className={
          isGraph
            ? "relative flex min-h-0 flex-1 flex-col"
            : "mx-auto max-w-3xl space-y-4 p-4 pt-4"
        }
      >
        {!isOwner && (
          <Link
            href={`/t/${token}/join`}
            className={`block min-h-12 rounded-lg bg-stone-800 px-4 py-3 text-center font-medium text-white ${
              isGraph ? "m-4 mb-0" : ""
            }`}
          >
            Join this tree
          </Link>
        )}

        {isOwner && (
          <AddRelativeForm
            token={token}
            persons={persons}
            relationships={relationships}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
        )}

        {persons.length > 0 && (
          <div
            role="group"
            aria-label="View mode"
            className="fixed left-2 top-16 z-10 flex flex-row gap-0.5 rounded-lg border border-stone-300 bg-white p-0.5 text-sm font-medium shadow-md"
          >
            <button
              type="button"
              onClick={() => setView("graph")}
              aria-pressed={view === "graph"}
              aria-label="Graph view"
              className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 ${
                view === "graph" ? "bg-stone-800 text-white" : "text-stone-600"
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
                className="h-5 w-5 shrink-0"
              >
                <rect x="16" y="16" width="6" height="6" rx="1" />
                <rect x="2" y="16" width="6" height="6" rx="1" />
                <rect x="9" y="2" width="6" height="6" rx="1" />
                <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
                <path d="M12 12V8" />
              </svg>
              <span className="hidden sm:inline">Graph</span>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              aria-label="List view"
              className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 ${
                view === "list" ? "bg-stone-800 text-white" : "text-stone-600"
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
                className="h-5 w-5 shrink-0"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        )}

        {view === "graph" ? (
          <>
            <TreeCanvas
              token={token}
              persons={persons}
              relationships={relationships}
              branches={branches}
              isOwner={isOwner}
            />
            <p className="pointer-events-none absolute bottom-3 right-3 z-[5] rounded-md bg-white/80 px-2 py-1 text-xs text-stone-600">
              Drag to pan, pinch or scroll to zoom, tap a person for details.
            </p>
          </>
        ) : (
          <TreeList
            token={token}
            persons={persons}
            relationships={relationships}
            branches={branches}
            isOwner={isOwner}
          />
        )}
      </main>
    </div>
  );
}
