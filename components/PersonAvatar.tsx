function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

export const GENDER_COLORS = { male: "#7bd1c4", female: "#f0a8c0" } as const;

// Circular profile photo, falling back to initials on a flat color when the
// person has no photo_url. When `gender` is known, it's shown as a color:
// a ring around a photo, or the fill behind initials.
export default function PersonAvatar({
  name,
  photoUrl,
  size = 40,
  gender,
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  gender?: "male" | "female" | null;
  className?: string;
}) {
  const accent = gender ? GENDER_COLORS[gender] : undefined;

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, boxShadow: accent ? `0 0 0 3px ${accent}` : undefined }}
        className={`shrink-0 rounded-full object-cover ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: accent }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        accent ? "text-stone-900" : "bg-stone-200 text-stone-600"
      } ${className ?? ""}`}
    >
      {initialsFor(name)}
    </div>
  );
}
