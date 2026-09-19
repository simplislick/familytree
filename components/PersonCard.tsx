"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectPersons,
  disconnectPersons,
  movePerson,
  removePerson,
  updatePersonPhoto,
} from "@/lib/actions";
import { uploadPersonPhoto } from "@/lib/photo-upload";
import PersonAvatar from "./PersonAvatar";
import type { JoinRelation, Person, Relationship } from "@/lib/types";

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "Child of",
  spouse: "Spouse of",
  parent: "Parent of",
};

// A single connection to add from the profile's point of view: the selected
// person becomes this profile's parent / child / spouse.
type FamilyKind = "parent" | "child" | "spouse";

const FAMILY_KIND_LABELS: Record<FamilyKind, string> = {
  parent: "Parent",
  child: "Child",
  spouse: "Spouse",
};

// Details card shown when a person is tapped in the tree. The tree owner
// additionally gets edit/move/remove moderation controls. "Edit" defers to
// the parent via `onEdit` — it opens the same overlay form used to add a
// relative (AddRelativeForm, in edit mode), rather than editing inline here.
export default function PersonCard({
  token,
  person,
  persons,
  relationships,
  isOwner,
  onEdit,
  onClose,
}: {
  token: string;
  person: Person;
  persons: Person[];
  relationships: Relationship[];
  isOwner: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [anchorId, setAnchorId] = useState("");
  const [relation, setRelation] = useState<JoinRelation>("child");
  const [familyKind, setFamilyKind] = useState<FamilyKind>("parent");
  const [familyPersonId, setFamilyPersonId] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const others = persons.filter((p) => p.id !== person.id);
  const nameOf = (id: string) => persons.find((p) => p.id === id)?.full_name ?? "Unknown";

  // This person's existing connections, from their own point of view: rows
  // saying who their parents, children, and spouse are. A 'parent' edge means
  // related_person_id is a parent of person_id.
  const familyRows: { relationshipId: string; kind: FamilyKind; otherId: string }[] = [
    ...relationships
      .filter((r) => r.type === "parent" && r.person_id === person.id)
      .map((r) => ({ relationshipId: r.id, kind: "parent" as const, otherId: r.related_person_id })),
    ...relationships
      .filter((r) => r.type === "parent" && r.related_person_id === person.id)
      .map((r) => ({ relationshipId: r.id, kind: "child" as const, otherId: r.person_id })),
    ...relationships
      .filter(
        (r) => r.type === "spouse" && (r.person_id === person.id || r.related_person_id === person.id),
      )
      .map((r) => ({
        relationshipId: r.id,
        kind: "spouse" as const,
        otherId: r.person_id === person.id ? r.related_person_id : r.person_id,
      })),
  ];

  // People not already connected to this person in the currently chosen way.
  const alreadyLinked = new Set(
    familyRows.filter((row) => row.kind === familyKind).map((row) => row.otherId),
  );
  const familyCandidates = others.filter((p) => !alreadyLinked.has(p.id));

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

  // Adds one edge without touching the person's other connections: the
  // selected person becomes this profile's parent, child, or spouse.
  function handleAddFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!familyPersonId) return;
    setError("");
    startTransition(async () => {
      const result = await connectPersons({
        token,
        personId: familyKind === "child" ? familyPersonId : person.id,
        relatedPersonId: familyKind === "child" ? person.id : familyPersonId,
        type: familyKind === "spouse" ? "spouse" : "parent",
      });
      if (result.ok) {
        setFamilyPersonId("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleRemoveFamily(relationshipId: string) {
    setError("");
    startTransition(async () => {
      const result = await disconnectPersons({ token, relationshipId });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80 sm:rounded-2xl sm:border">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <PersonAvatar
              name={person.full_name}
              photoUrl={person.photo_url}
              gender={person.gender}
              size={48}
            />
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
            {person.chinese_name && <p className="text-sm text-stone-600">{person.chinese_name}</p>}
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

      <div className="mt-4 border-t border-stone-100 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Family</h4>
        {familyRows.length === 0 ? (
          <p className="mt-1.5 text-sm text-stone-500">Not connected to anyone yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-stone-100">
            {familyRows.map((row) => (
              <li key={row.relationshipId} className="flex min-h-10 items-center gap-2 py-1">
                <span className="w-14 shrink-0 text-xs font-medium text-stone-500">
                  {FAMILY_KIND_LABELS[row.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-900">
                  {nameOf(row.otherId)}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRemoveFamily(row.relationshipId)}
                    aria-label={`Remove ${FAMILY_KIND_LABELS[row.kind].toLowerCase()} ${nameOf(row.otherId)}`}
                    className="min-h-9 min-w-9 shrink-0 text-stone-400 disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner && others.length > 0 && (
          <form onSubmit={handleAddFamily} className="mt-2 flex gap-2">
            <select
              value={familyKind}
              onChange={(e) => {
                setFamilyKind(e.target.value as FamilyKind);
                setFamilyPersonId("");
              }}
              aria-label="Relation to add"
              className="block min-h-11 w-24 shrink-0 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
            >
              {(Object.keys(FAMILY_KIND_LABELS) as FamilyKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {FAMILY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <select
              required
              value={familyPersonId}
              onChange={(e) => setFamilyPersonId(e.target.value)}
              aria-label={`Person to add as ${FAMILY_KIND_LABELS[familyKind].toLowerCase()}`}
              className="block min-h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
            >
              <option value="" disabled>
                Person…
              </option>
              {familyCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isPending || !familyPersonId}
              className="min-h-11 shrink-0 rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
        {!isOwner && error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {isOwner && (
        <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          {!moving ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium"
              >
                Edit
              </button>
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
