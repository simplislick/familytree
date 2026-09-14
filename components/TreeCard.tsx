"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import { deleteTree, duplicateTree, renameTree } from "@/lib/actions";
import type { Tree } from "@/lib/types";

// Landing page tree card: the name/badge area links straight into the tree
// (no separate "View tree" button). The owner additionally gets a "⋮" menu
// to rename, duplicate, or delete the tree — rename and delete both go
// through a confirmation overlay since rename can lose the old name by
// mistake and delete is irreversible.
export default function TreeCard({ tree, isOwner }: { tree: Tree; isOwner: boolean }) {
  const router = useRouter();
  const sharePath = `/t/${tree.share_token}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(tree.name);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  function closeOverlay() {
    setOverlay(null);
    setError("");
    setName(tree.name);
  }

  function openRename() {
    setName(tree.name);
    setError("");
    setOverlay("rename");
    setMenuOpen(false);
  }

  function openDelete() {
    setError("");
    setOverlay("delete");
    setMenuOpen(false);
  }

  function handleDuplicate() {
    setMenuOpen(false);
    setError("");
    startTransition(async () => {
      const result = await duplicateTree(tree.share_token);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === tree.name) {
      closeOverlay();
      return;
    }
    startTransition(async () => {
      const result = await renameTree(tree.share_token, trimmed);
      if (result.ok) {
        closeOverlay();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTree(tree.share_token);
      if (result.ok) {
        closeOverlay();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <li className="relative rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={sharePath} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold text-stone-900">{tree.name}</span>
            <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
              {isOwner ? "Owner" : "Member"}
            </span>
          </div>
        </Link>

        {isOwner && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Tree options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone-600 active:bg-stone-100"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={openRename}
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm font-medium text-stone-800 active:bg-stone-100"
                >
                  Edit name
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDuplicate}
                  disabled={isPending}
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm font-medium text-stone-800 active:bg-stone-100 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openDelete}
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm font-medium text-red-700 active:bg-stone-100"
                >
                  Delete tree
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <CopyButton text={sharePath} />
      </div>

      {!overlay && error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {overlay === "rename" && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-tree-heading"
        >
          <form
            onSubmit={handleRename}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
          >
            <h3 id="rename-tree-heading" className="text-lg font-semibold text-stone-900">
              Rename tree
            </h3>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Tree name"
              className="mt-3 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeOverlay}
                disabled={isPending}
                className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !name.trim()}
                className="min-h-11 flex-1 rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {overlay === "delete" && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tree-heading"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 id="delete-tree-heading" className="text-lg font-semibold text-stone-900">
              Delete &quot;{tree.name}&quot;?
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              This permanently deletes the tree and everyone in it. This can&apos;t be undone.
            </p>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeOverlay}
                disabled={isPending}
                className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="min-h-11 flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
