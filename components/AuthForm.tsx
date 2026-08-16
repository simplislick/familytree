"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Email magic-link sign-in, used by tree owners (create tree / dashboard).
export default function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (!supabase) {
    return (
      <p className="text-sm text-amber-800">
        Supabase is not configured — see <code>.env.example</code>.
      </p>
    );
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        Check your email for a sign-in link, then come back here.
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-3 block min-h-11 w-full rounded-lg bg-green-700 px-4 py-2 font-medium text-white"
        >
          I&apos;ve signed in — continue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium">
        Your email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {status === "error" && <p className="text-sm text-red-700">{message}</p>}
    </form>
  );
}
