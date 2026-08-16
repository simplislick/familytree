"use client";

import { useState } from "react";

const DEFAULT_CLASS =
  "flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-800 active:bg-stone-100";

// Icon-only share button: uses the native share sheet where available,
// otherwise copies the link and shows a brief checkmark.
export default function ShareButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = text.startsWith("/") ? `${window.location.origin}${text}` : text;

    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // User cancelled the share sheet; no-op.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. non-secure context); no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? "Link copied" : "Share this tree"}
      title={copied ? "Link copied" : "Share this tree"}
      className={className ?? DEFAULT_CLASS}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <polyline points="20 6 9 17 4 12" />
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
          className="h-5 w-5"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
    </button>
  );
}
