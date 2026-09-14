"use client";

import { useState } from "react";
import Link from "next/link";
import TreeNavbar from "@/components/TreeNavbar";
import TreeCanvas from "@/components/TreeCanvas";
import AddRelativeForm from "@/components/AddRelativeForm";
import type { Person, Relationship } from "@/lib/types";

// Client-side shell for the tree home page: owns the add-relative overlay's
// open state so the navbar's "+" (server-rendered tree above it) can drive it.
export default function TreeHome({
  token,
  treeName,
  shareToken,
  isOwner,
  persons,
  relationships,
}: {
  token: string;
  treeName: string;
  shareToken: string;
  isOwner: boolean;
  persons: Person[];
  relationships: Relationship[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <TreeNavbar
        token={token}
        treeName={treeName}
        isOwner={isOwner}
        showAdd={isOwner}
        onAddClick={() => setAddOpen(true)}
        shareText={`/t/${shareToken}`}
        showShare={isOwner}
      />

      <main className="mx-auto max-w-3xl space-y-4 p-4 pt-4">
        {!isOwner && (
          <Link
            href={`/t/${token}/join`}
            className="block min-h-12 rounded-lg bg-stone-800 px-4 py-3 text-center font-medium text-white"
          >
            Join this tree
          </Link>
        )}

        {isOwner && (
          <AddRelativeForm
            token={token}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
        )}

        <TreeCanvas
          token={token}
          persons={persons}
          relationships={relationships}
          isOwner={isOwner}
        />

        <p className="text-xs text-stone-600">
          Drag to pan, pinch or scroll to zoom, tap a person for details.
        </p>
      </main>
    </>
  );
}
