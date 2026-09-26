"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TreeNavbar from "@/components/TreeNavbar";
import PersonAvatar from "@/components/PersonAvatar";
import {
  markNotificationRead,
  sendSignInLink,
  signOut,
  updateProfilePhoto,
} from "@/lib/actions";
import { uploadPersonPhoto } from "@/lib/photo-upload";
import type { Notification } from "@/lib/types";

// Landing page header: plain TreeNavbar (no add/share) plus notifications
// and settings icons, each opening its own overlay.
export default function HomeHeader({
  avatarUrl,
  notifications,
  email,
}: {
  avatarUrl: string | null;
  notifications: Notification[];
  /** Signed-in email account, or null for an anonymous session. */
  email: string | null;
}) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<"settings" | "notifications" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState("");
  const [accountError, setAccountError] = useState("");

  async function handleSendLink(formData: FormData) {
    const address = String(formData.get("email") ?? "");
    setAccountError("");
    setIsSending(true);
    const result = await sendSignInLink(address);
    setIsSending(false);
    if (result.ok) {
      setLinkSentTo(address.trim());
    } else {
      setAccountError(result.message);
    }
  }

  async function handleSignOut() {
    setAccountError("");
    const result = await signOut();
    if (result.ok) {
      router.refresh();
    } else {
      setAccountError(result.message);
    }
  }
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

            <div className="mt-6 border-t border-stone-200 pt-4">
              <h4 className="text-base font-semibold text-stone-900">Account</h4>
              {email ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-stone-600">
                    Signed in as <span className="font-medium text-stone-900">{email}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-11 shrink-0 px-2 text-sm font-medium text-stone-800 underline"
                  >
                    Sign out
                  </button>
                </div>
              ) : linkSentTo ? (
                <p className="mt-2 text-sm text-stone-600">
                  Check <span className="font-medium text-stone-900">{linkSentTo}</span> for a
                  sign-in link, and open it in this browser.
                </p>
              ) : (
                <form action={handleSendLink} className="mt-2 space-y-3">
                  <p className="text-sm text-stone-600">
                    Sign in with email to keep your trees across browsers and devices.
                  </p>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@example.com"
                    className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={isSending}
                    className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-60"
                  >
                    {isSending ? "Sending…" : "Email me a sign-in link"}
                  </button>
                </form>
              )}
              {accountError && <p className="mt-2 text-sm text-red-700">{accountError}</p>}
            </div>
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
