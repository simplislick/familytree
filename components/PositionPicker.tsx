"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { positionSelf } from "@/lib/actions";
import type { JoinRelation, Person } from "@/lib/types";

const RELATION_LABELS: Record<JoinRelation, string> = {
  child: "I'm their child",
  spouse: "I'm their spouse",
  parent: "I'm their parent",
};

// "How are you related to someone already in the tree?" — pick a person and
// a relation, creating the joiner's person row plus the edge.
export default function PositionPicker({
  token,
  persons,
  defaultName,
  defaultBirthDate,
}: {
  token: string;
  persons: Person[];
  defaultName: string;
  defaultBirthDate: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [birthDate, setBirthDate] = useState(defaultBirthDate);
  const [anchorId, setAnchorId] = useState("");
  const [relation, setRelation] = useState<JoinRelation>("child");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!anchorId) {
      setError("Pick someone you're related to.");
      return;
    }
    startTransition(async () => {
      const result = await positionSelf({
        token,
        anchorPersonId: anchorId,
        relation,
        fullName,
        birthDate: birthDate || null,
      });
      if (result.ok) {
        router.push(`/t/${token}/view`);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm font-medium">
        Your full name
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Birth date (optional)
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm font-medium">
        Who in the tree are you related to?
        <select
          required
          value={anchorId}
          onChange={(e) => setAnchorId(e.target.value)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
        >
          <option value="" disabled>
            Choose a person…
          </option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">How are you related to them?</legend>
        <div className="mt-2 grid gap-2">
          {(Object.keys(RELATION_LABELS) as JoinRelation[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRelation(r)}
              aria-pressed={relation === r}
              className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${
                relation === r
                  ? "border-stone-800 bg-stone-800 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              {RELATION_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Adding you…" : "Add me to the tree"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
