"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRelative } from "@/lib/actions";
import type { JoinRelation, Person } from "@/lib/types";

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "Child of",
  spouse: "Spouse of",
  parent: "Parent of",
};

// Owner adds an unclaimed placeholder relative; the relative can later claim
// it by joining with a matching email or phone. Renders as an overlay; pass
// `open`/`onOpenChange` to drive it externally (e.g. from a navbar "+"), or
// omit them to use the built-in "+ Add a relative" trigger button.
export default function AddRelativeForm({
  token,
  persons,
  open: openProp,
  onOpenChange,
}: {
  token: string;
  persons: Person[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  function setOpen(next: boolean) {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  }

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const [relation, setRelation] = useState<JoinRelation>("child");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fullName = [firstName, middleName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

    startTransition(async () => {
      const result = await addRelative({
        token,
        anchorPersonId: anchorId || null,
        relation: anchorId ? relation : null,
        fullName,
        birthDate: birthDate || null,
        email: email || null,
        phone: phone || null,
      });
      if (result.ok) {
        setFirstName("");
        setMiddleName("");
        setLastName("");
        setBirthDate("");
        setEmail("");
        setPhone("");
        setAnchorId("");
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
    <div className="fixed inset-0 z-20 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Add a relative</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="min-h-11 min-w-11 text-xl text-stone-600"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        <input
          type="text"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          placeholder="Middle name (optional)"
          className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
        />
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          aria-label="Birth date"
          className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (for claiming)"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (for claiming)"
            className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-600"
          />
        </div>
        <div className="space-y-2">
          <select
            value={anchorId}
            onChange={(e) => setAnchorId(e.target.value)}
            aria-label="Related to"
            className="block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Not connected yet (add later)</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          {anchorId && (
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as JoinRelation)}
              aria-label="Relation"
              className="block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              {(Object.keys(RELATION_LABELS) as JoinRelation[]).map((r) => (
                <option key={r} value={r}>
                  {RELATION_LABELS[r]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="min-h-11 flex-1 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
