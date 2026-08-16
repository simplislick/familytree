"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Dev bypass: signs in anonymously instead of sending an email magic link,
// so the tree UI/actions (which only check auth.uid()) can be exercised
// without waiting on email. Requires "Anonymous sign-ins" enabled in the
// Supabase project's Authentication settings.
export default function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  async function handleSkip() {
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    setStatus("loading");
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (!supabase) {
    return (
      <p className="text-sm text-amber-800">
        Supabase is not configured — see <code>.env.example</code>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSkip}
        disabled={status === "loading"}
        className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {status === "loading" ? "Signing in…" : "Fast forward (skip sign-in)"}
      </button>
      {status === "error" && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
