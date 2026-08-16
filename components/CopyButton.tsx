"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const url = text.startsWith("/")
            ? `${window.location.origin}${text}`
            : text;
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable (e.g. non-secure context); no-op.
        }
      }}
      className="min-h-11 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white active:bg-stone-700"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
