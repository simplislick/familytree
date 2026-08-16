"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeJoin } from "@/lib/matching";

type PendingJoin = {
  fullName: string;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
};

// Name, birth date, and email (magic link) or phone (OTP) verification, then
// match/claim via the completeJoin server action.
export default function JoinForm({ token, treeName }: { token: string; treeName: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [phase, setPhase] = useState<"form" | "otp" | "email-sent" | "finishing">("form");
  const [pending, setPending] = useState<PendingJoin | null>(null);
  const [error, setError] = useState("");

  const storageKey = `join:${token}`;

  async function finishJoin(details: PendingJoin) {
    setPhase("finishing");
    const result = await completeJoin({ token, ...details });
    if (result.outcome === "claimed" || result.outcome === "attached") {
      sessionStorage.removeItem(storageKey);
      router.push(`/t/${token}/view`);
    } else if (result.outcome === "new") {
      sessionStorage.removeItem(storageKey);
      const params = new URLSearchParams({ name: details.fullName });
      if (details.birthDate) params.set("birthDate", details.birthDate);
      router.push(`/t/${token}/position?${params.toString()}`);
    } else if (result.outcome === "error") {
      setPhase("form");
      setError(result.message);
    }
  }

  // After a magic-link redirect, resume a pending join.
  useEffect(() => {
    if (!supabase) return;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        try {
          finishJoin(JSON.parse(saved) as PendingJoin);
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supabase) {
    return (
      <p className="text-sm text-amber-800">
        Supabase is not configured — see <code>.env.example</code>.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const details: PendingJoin = {
      fullName: fullName.trim(),
      birthDate: birthDate || null,
      email: method === "email" ? contact.trim() : null,
      phone: method === "phone" ? contact.trim() : null,
    };
    if (method === "email") {
      sessionStorage.setItem(storageKey, JSON.stringify(details));
      const { error: otpError } = await supabase!.auth.signInWithOtp({
        email: details.email!,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/t/${token}/join`)}`,
        },
      });
      if (otpError) {
        sessionStorage.removeItem(storageKey);
        setError(otpError.message);
      } else {
        setPhase("email-sent");
      }
    } else {
      setPending(details);
      const { error: otpError } = await supabase!.auth.signInWithOtp({ phone: details.phone! });
      if (otpError) {
        setError(otpError.message);
      } else {
        setPhase("otp");
      }
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!pending?.phone) return;
    const { error: verifyError } = await supabase!.auth.verifyOtp({
      phone: pending.phone,
      token: otpCode.trim(),
      type: "sms",
    });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    await finishJoin(pending);
  }

  if (phase === "email-sent") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        We sent a sign-in link to <strong>{contact}</strong>. Open it on this
        device to finish joining <strong>{treeName}</strong>.
      </div>
    );
  }

  if (phase === "otp") {
    return (
      <form onSubmit={handleVerify} className="space-y-3">
        <p className="text-sm text-stone-600">
          Enter the code we texted to <strong>{pending?.phone}</strong>.
        </p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          placeholder="123456"
          className="block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tracking-widest"
        />
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white"
        >
          Verify and join
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    );
  }

  if (phase === "finishing") {
    return <p className="text-sm text-stone-600">Finishing up…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Verification method">
        {(["email", "phone"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${
              method === m
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-300 bg-white text-stone-700"
            }`}
          >
            {m === "email" ? "Email link" : "Phone text"}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium">
        {method === "email" ? "Email" : "Phone number"}
        <input
          type={method === "email" ? "email" : "tel"}
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={method === "email" ? "you@example.com" : "+1 555 123 4567"}
          className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white"
      >
        {method === "email" ? "Send me a sign-in link" : "Text me a code"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
