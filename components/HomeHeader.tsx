"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TreeNavbar from "@/components/TreeNavbar";
import PersonAvatar from "@/components/PersonAvatar";
import { markNotificationRead, updateProfilePhoto } from "@/lib/actions";
import { uploadPersonPhoto } from "@/lib/photo-upload";
import type { Notification } from "@/lib/types";

// Landing page header: plain TreeNavbar (no add/share) plus notifications
// and settings icons, each opening its own overlay.
export default function HomeHeader({
  avatarUrl,
  notifications,
}: {
  avatarUrl: string | null;
  notifications: Notification[];
}) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<"settings" | "notifications" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const hasUnread = notifications.some((n) => !n.read);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsUploading(true);
    const uploadResult = await uploadPersonPhoto(file);
    if (!uploadResult.ok) {
      setIsUploading(false);
      setError(uploadResult.message);
      return;
    }
    const result = await updateProfilePhoto(uploadResult.url);
    setIsUploading(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  async function handleMarkRead(id: string) {
    const result = await markNotificationRead(id);
    if (result.ok) router.refresh();
  }

  return (
    <>
      <TreeNavbar
        token=""
        treeName="Family Tree"
        isOwner={false}
        showAdd={false}
        shareText=""
        showShare={false}
        showNotifications
        onNotificationsClick={() => setOverlay("notifications")}
        hasUnreadNotifications={hasUnread}
        showSettings
        onSettingsClick={() => setOverlay("settings")}
      />

      {overlay === "settings" && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-heading"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 id="settings-heading" className="text-lg font-semibold text-stone-900">
                Profile picture
              </h3>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                aria-label="Close"
                className="min-h-11 min-w-11 text-xl text-stone-600"
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3">
              <PersonAvatar name="" photoUrl={avatarUrl} size={80} />
              <label className="cursor-pointer text-sm font-medium text-stone-800 underline">
                {isUploading ? "Uploading…" : "Change photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>

            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          </div>
        </div>
      )}

      {overlay === "notifications" && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notifications-heading"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 id="notifications-heading" className="text-lg font-semibold text-stone-900">
                Notifications
              </h3>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                aria-label="Close"
                className="min-h-11 min-w-11 text-xl text-stone-600"
              >
                ×
              </button>
            </div>

            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">No activity yet.</p>
            ) : (
              <ul className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`rounded-lg border p-3 text-sm ${
                      n.read
                        ? "border-stone-200 bg-white text-stone-600"
                        : "border-stone-300 bg-stone-100 text-stone-900"
                    }`}
                  >
                    <p>{n.message}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-stone-600">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          className="min-h-11 px-2 text-xs font-medium text-stone-600 underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
