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
// it by joining with a matching email or phone.
export default function AddRelativeForm({
  token,
  persons,
}: {
  token: string;
  persons: Person[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
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
    if (!anchorId) {
      setError("Choose who they're related to.");
      return;
    }
    startTransition(async () => {
      const result = await addRelative({
        token,
        anchorPersonId: anchorId,
        relation,
        fullName,
        birthDate: birthDate || null,
        email: email || null,
        phone: phone || null,
      });
      if (result.ok) {
        setFullName("");
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="font-semibold">Add a relative</h3>
      <input
        type="text"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Full name"
        className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <input
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
        aria-label="Birth date"
        className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (for claiming)"
          className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (for claiming)"
          className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={relation}
          onChange={(e) => setRelation(e.target.value as JoinRelation)}
          aria-label="Relation"
          className="block min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
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
          aria-label="Related to"
          className="block min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Person…
          </option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
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
  );
}
