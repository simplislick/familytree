"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeJoin } from "@/lib/matching";

// Collects name, birth date, and optional email/phone (used only to match
// against existing placeholder profiles), then matches/claims via the
// completeJoin server action. No identity verification — anyone with the
// share link can join.
export default function JoinForm({ token, treeName }: { token: string; treeName: string }) {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const details = {
      token,
      fullName: fullName.trim(),
      birthDate: birthDate || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    };

    const result = await completeJoin(details);

    if (result.outcome === "error") {
      setSubmitting(false);
      setError(result.message);
    } else if (result.outcome === "new") {
      const params = new URLSearchParams({ name: details.fullName });
      if (details.birthDate) params.set("birthDate", details.birthDate);
      router.push(`/t/${token}/position?${params.toString()}`);
    } else {
      router.push(`/t/${token}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-stone-600">
        Joining <strong>{treeName}</strong>. If we find a matching profile
        you&apos;ll claim it; otherwise you&apos;ll add yourself.
      </p>
      <label className="block text-sm font-medium">
        Full name
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
        Email (optional)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Phone (optional)
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join tree"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
