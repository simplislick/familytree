"use client";

import { createClient } from "@/lib/supabase/client";

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; message: string };

// Uploads to the public "person-photos" bucket (see
// supabase/migrations/0002_person_photos.sql) and returns its public URL.
export async function uploadPersonPhoto(file: File): Promise<PhotoUploadResult> {
  const supabase = createClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("person-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return { ok: false, message: error.message };

  const { data } = supabase.storage.from("person-photos").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
