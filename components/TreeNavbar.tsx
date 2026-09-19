"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ShareButton from "@/components/ShareButton";
import { renameTree } from "@/lib/actions";

const ICON_BUTTON_CLASS =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-white active:bg-white/10";
const SMALL_ICON_BUTTON_CLASS =
  "flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-white active:bg-white/10";

// Full-bleed dark top bar for the tree home page: "+" add-relative trigger,
// bold centered tree name (editable by the owner via the pencil icon), and
// a share icon.
export default function TreeNavbar({
  token,
  treeName,
  isOwner,
  showAdd,
  onAddClick,
  shareText,
  showShare,
  showNotifications,
  onNotificationsClick,
  hasUnreadNotifications,
  showSettings,
  onSettingsClick,
}: {
  token: string;
  treeName: string;
  isOwner: boolean;
  showAdd: boolean;
  onAddClick?: () => void;
  shareText: string;
  showShare: boolean;
  showNotifications?: boolean;
  onNotificationsClick?: () => void;
  hasUnreadNotifications?: boolean;
  showSettings?: boolean;
  onSettingsClick?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(treeName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setName(treeName);
    setError("");
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === treeName) {
      setEditing(false);
      return;
    }
    setIsSaving(true);
    setError("");
    const result = await renameTree(token, trimmed);
    setIsSaving(false);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <header className="bg-stone-900 px-2 py-2">
      <div className="flex items-center gap-1">
        {showAdd ? (
          <button
            type="button"
            onClick={onAddClick}
            aria-label="Add a relative"
            className={ICON_BUTTON_CLASS}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        ) : (
          <span className={ICON_BUTTON_CLASS} aria-hidden="true" />
        )}

        {editing ? (
          <form onSubmit={handleSave} className="flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Tree name"
              className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-center text-lg font-bold text-white placeholder:text-white/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSaving}
              aria-label="Save name"
              className={SMALL_ICON_BUTTON_CLASS}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Cancel"
              className={SMALL_ICON_BUTTON_CLASS}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            <h1 className="min-w-0 truncate text-center text-lg font-bold text-white">
              {treeName}
            </h1>
            {isOwner && (
              <button
                type="button"
                onClick={startEdit}
                aria-label="Rename tree"
                className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-white/70 active:bg-white/10"
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
          </div>
        )}

        {showShare && <ShareButton text={shareText} className={ICON_BUTTON_CLASS} />}

        {showNotifications && (
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifications"
            className={`relative ${ICON_BUTTON_CLASS}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {hasUnreadNotifications && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
              />
            )}
          </button>
        )}

        {showSettings && (
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Settings"
            className={ICON_BUTTON_CLASS}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        )}

        {!showShare && !showNotifications && !showSettings && (
          <span className={ICON_BUTTON_CLASS} aria-hidden="true" />
        )}
      </div>
      {editing && error && <p className="mt-1 text-center text-xs text-red-300">{error}</p>}
    </header>
  );
}
