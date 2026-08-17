"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { movePerson, removePerson, updatePersonPhoto } from "@/lib/actions";
import { uploadPersonPhoto } from "@/lib/photo-upload";
import PersonAvatar from "./PersonAvatar";
import type { JoinRelation, Person } from "@/lib/types";

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "Child of",
  spouse: "Spouse of",
  parent: "Parent of",
};

// Details card shown when a person is tapped in the tree. The tree owner
// additionally gets move/remove moderation controls.
export default function PersonCard({
  token,
  person,
  persons,
  isOwner,
  onClose,
}: {
  token: string;
  person: Person;
  persons: Person[];
  isOwner: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [anchorId, setAnchorId] = useState("");
  const [relation, setRelation] = useState<JoinRelation>("child");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const others = persons.filter((p) => p.id !== person.id);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsUploadingPhoto(true);
    const uploadResult = await uploadPersonPhoto(file);
    if (!uploadResult.ok) {
      setIsUploadingPhoto(false);
      setError(uploadResult.message);
      return;
    }
    const result = await updatePersonPhoto({ token, personId: person.id, photoUrl: uploadResult.url });
    setIsUploadingPhoto(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  function handleMove(e: React.FormEvent) {
    e.preventDefault();
    if (!anchorId) return;
    startTransition(async () => {
      const result = await movePerson({
        token,
        personId: person.id,
        anchorPersonId: anchorId,
        relation,
      });
      if (result.ok) {
        onClose();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removePerson({ token, personId: person.id });
      if (result.ok) {
        onClose();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-2xl border-t border-stone-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80 sm:rounded-2xl sm:border">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <PersonAvatar name={person.full_name} photoUrl={person.photo_url} size={48} />
            {isOwner && (
              <label className="mt-1 block cursor-pointer text-center text-[11px] font-medium text-stone-600 underline">
                {isUploadingPhoto ? "Uploading…" : "Change"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={isUploadingPhoto}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{person.full_name}</h3>
            {person.birth_date && (
              <p className="text-sm text-stone-600">Born {person.birth_date}</p>
            )}
            <p className="mt-1 text-xs">
              {person.user_id ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">Member</span>
              ) : (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                  Not yet joined
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="min-h-11 min-w-11 text-xl text-stone-600"
        >
          ×
        </button>
      </div>

      {isOwner && (
        <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          {!moving ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMoving(true)}
                className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium"
              >
                Move
              </button>
              {!confirmingRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  className="min-h-11 flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="min-h-11 flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isPending ? "Removing…" : "Confirm remove"}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleMove} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value as JoinRelation)}
                  aria-label="New relation"
                  className="block min-h-11 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                >
                  {(Object.keys(RELATION_LABELS) as JoinRelation[]).map((r) => (
                    <option key={r} value={r}>
                      {RELATION_LABELS[r]}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={anchorId}
                  onChange={(e) => setAnchorId(e.target.value)}
                  aria-label="New anchor person"
                  className="block min-h-11 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="" disabled>
                    Person…
                  </option>
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isPending || !anchorId}
                  className="min-h-11 flex-1 rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isPending ? "Moving…" : "Move here"}
                </button>
                <button
                  type="button"
                  onClick={() => setMoving(false)}
                  className="min-h-11 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
