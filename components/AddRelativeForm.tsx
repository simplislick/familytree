"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRelative, connectPersons, disconnectPersons, removePerson, updatePerson } from "@/lib/actions";
import { uploadPersonPhoto } from "@/lib/photo-upload";
import PersonAvatar from "./PersonAvatar";
import type { Person, Relationship } from "@/lib/types";

function splitName(fullName: string): [string, string, string] {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", "", ""];
  if (parts.length === 1) return [parts[0], "", ""];
  if (parts.length === 2) return [parts[0], "", parts[1]];
  return [parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]];
}

// Owner adds an unclaimed placeholder relative, unconnected to anyone yet;
// the owner links them into the tree afterward, and the relative can later
// claim the entry by joining with a matching email or phone. Pass `person`
// to reuse the same form to edit an existing entry's details instead.
// Renders as an overlay; pass `open`/`onOpenChange` to drive it externally
// (e.g. from a navbar "+" or a list row's edit icon), or omit them to use
// the built-in "+ Add a relative" trigger (add mode only).
export default function AddRelativeForm({
  token,
  person,
  persons = [],
  relationships = [],
  open: openProp,
  onOpenChange,
}: {
  token: string;
  person?: Person;
  // Everyone in the tree + its relationship edges, for the partner selector.
  persons?: Person[];
  relationships?: Relationship[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEditing = !!person;
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  function setOpen(next: boolean) {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  }

  // The person's current spouse edge, if any, so edit mode can preselect the
  // partner and swap the edge only when the selection actually changes.
  const currentSpouseEdge = person
    ? relationships.find(
        (r) =>
          r.type === "spouse" && (r.person_id === person.id || r.related_person_id === person.id),
      )
    : undefined;
  const currentSpouseId = currentSpouseEdge
    ? currentSpouseEdge.person_id === person!.id
      ? currentSpouseEdge.related_person_id
      : currentSpouseEdge.person_id
    : "";
  const partnerCandidates = persons.filter((p) => p.id !== person?.id);

  const [initFirst, initMiddle, initLast] = person ? splitName(person.full_name) : ["", "", ""];
  const [firstName, setFirstName] = useState(initFirst);
  const [middleName, setMiddleName] = useState(initMiddle);
  const [lastName, setLastName] = useState(initLast);
  const [gender, setGender] = useState<"male" | "female" | null>(person?.gender ?? "male");
  const [birthDate, setBirthDate] = useState(person?.birth_date ?? "");
  const [chineseName, setChineseName] = useState(person?.chinese_name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(person?.photo_url ?? null);
  const [spouseId, setSpouseId] = useState(currentSpouseId);
  // If the server-side spouse edge changes after mount (e.g. the router
  // refresh from a just-added partner lands while the form is open), resync
  // the selection to the new truth.
  const [prevSpouseId, setPrevSpouseId] = useState(currentSpouseId);
  if (prevSpouseId !== currentSpouseId) {
    setPrevSpouseId(currentSpouseId);
    setSpouseId(currentSpouseId);
  }
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  // Edit mode only: "Remove" opens a confirmation overlay on top of this
  // form rather than deleting immediately.
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const accent = gender === "female" ? "#f0a8c0" : "#7bd1c4";

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setIsUploadingPhoto(true);
    const result = await uploadPersonPhoto(file);
    setIsUploadingPhoto(false);
    if (result.ok) {
      setPhotoUrl(result.url);
    } else {
      setError(result.message);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fullName = [firstName, middleName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

    startTransition(async () => {
      let result = isEditing
        ? await updatePerson({
            token,
            personId: person.id,
            fullName,
            chineseName: chineseName || null,
            birthDate: birthDate || null,
            photoUrl,
            email: email || null,
            phone: phone || null,
            gender,
          })
        : await addRelative({
            token,
            // A chosen partner links the new person in right away.
            anchorPersonId: spouseId || null,
            relation: spouseId ? "spouse" : null,
            fullName,
            chineseName: chineseName || null,
            birthDate: birthDate || null,
            photoUrl,
            email: email || null,
            phone: phone || null,
            gender,
          });

      // Edit mode: the partner selection changed — drop the old spouse edge
      // (if any) and add the new one (if a partner is chosen).
      if (result.ok && isEditing && spouseId !== currentSpouseId) {
        if (currentSpouseEdge) {
          result = await disconnectPersons({ token, relationshipId: currentSpouseEdge.id });
        }
        if (result.ok && spouseId) {
          result = await connectPersons({
            token,
            personId: person.id,
            relatedPersonId: spouseId,
            type: "spouse",
          });
        }
      }

      if (result.ok) {
        if (!isEditing) {
          setFirstName("");
          setMiddleName("");
          setLastName("");
          setGender("male");
          setBirthDate("");
          setChineseName("");
          setEmail("");
          setPhone("");
          setPhotoUrl(null);
          setSpouseId("");
        }
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleRemove() {
    if (!person) return;
    setError("");
    startTransition(async () => {
      const result = await removePerson({ token, personId: person.id });
      if (result.ok) {
        setConfirmingRemove(false);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    if (isControlled) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700"
      >
        + Add a relative
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <form
        onSubmit={handleSubmit}
        style={{ borderTopColor: accent, borderTopWidth: 4 }}
        className="relative z-10 max-h-[85vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl transition-colors"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{isEditing ? "Edit details" : "Add a relative"}</h3>
          <div
            role="group"
            aria-label="Gender"
            className="inline-flex rounded-lg border border-stone-300 p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setGender("male")}
              aria-pressed={gender === "male"}
              style={gender === "male" ? { backgroundColor: "#7bd1c4" } : undefined}
              className={`min-h-8 rounded-md px-2.5 ${
                gender === "male" ? "text-stone-900" : "text-stone-600"
              }`}
            >
              M
            </button>
            <button
              type="button"
              onClick={() => setGender("female")}
              aria-pressed={gender === "female"}
              style={gender === "female" ? { backgroundColor: "#f0a8c0" } : undefined}
              className={`min-h-8 rounded-md px-2.5 ${
                gender === "female" ? "text-stone-900" : "text-stone-600"
              }`}
            >
              F
            </button>
          </div>
        </div>
        <div className="flex justify-center">
          <div
            className="relative rounded-full transition-shadow"
            style={{ boxShadow: `0 0 0 4px ${accent}` }}
          >
            <PersonAvatar name={firstName || "?"} photoUrl={photoUrl} size={96} />
            <label
              aria-label={photoUrl ? "Change photo" : "Add photo"}
              className="absolute inset-0 cursor-pointer rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-500"
            >
              <span
                style={{ backgroundColor: accent }}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full text-stone-900 shadow ring-2 ring-white"
              >
                {isUploadingPhoto ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="h-4 w-4 animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-9-9" />
                  </svg>
                ) : (
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
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={isUploadingPhoto}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
          <input
            type="text"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="Middle"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            aria-label="Birth date"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          />
          <input
            type="text"
            value={chineseName}
            onChange={(e) => setChineseName(e.target.value)}
            placeholder="Chinese name"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
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
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="block min-h-11 w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
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
              <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.325 1.227 13 13 0 0 0 6.426 6.39" />
            </svg>
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="block min-h-11 w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        {partnerCandidates.length > 0 && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
            <select
              value={spouseId}
              onChange={(e) => setSpouseId(e.target.value)}
              aria-label="Partner"
              className={`block min-h-11 w-full appearance-none rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm ${
                spouseId ? "text-stone-800" : "text-stone-600"
              }`}
            >
              <option value="">No partner</option>
              {partnerCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || isUploadingPhoto}
            style={{ backgroundColor: accent }}
            className="min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium text-stone-900 disabled:opacity-50"
          >
            {isPending ? (isEditing ? "Saving…" : "Adding…") : isEditing ? "Save" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              aria-label={`Remove ${person.full_name} from the tree`}
              className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M9 3a1 1 0 0 0-1 1v1H4a1 1 0 0 0 0 2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7h1a1 1 0 1 0 0-2h-4V4a1 1 0 0 0-1-1H9Zm1 2h4V5h-4v0Zm-1 5a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0v-8Zm5-1a1 1 0 0 0-1 1v8a1 1 0 1 0 2 0v-8a1 1 0 0 0-1-1Z" />
              </svg>
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>

      {confirmingRemove && person && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => (isPending ? null : setConfirmingRemove(false))}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xs space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-semibold">Remove {person.full_name}?</h3>
            <p className="text-sm text-stone-600">
              This removes them from the tree along with their parent, child, and spouse
              connections. This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingRemove(false)}
                className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
