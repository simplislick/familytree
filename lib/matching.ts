"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tree } from "@/lib/types";

export type JoinResult =
  | { outcome: "claimed" | "attached"; personId: string }
  | { outcome: "new" }
  | { outcome: "error"; message: string };

/**
 * Runs after the joiner submits the join form. Matches their details against
 * persons in the tree and claims an unclaimed placeholder or attaches to
 * their existing profile. The match + claim runs inside a single Postgres
 * function (claim_or_create_person), so two people cannot claim the same
 * placeholder. Returns 'new' when there is no match — the joiner then
 * positions themselves manually.
 */
export async function completeJoin(input: {
  token: string;
  fullName: string;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
}): Promise<JoinResult> {
  const supabase = await createClient();
  if (!supabase) return { outcome: "error", message: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error", message: "Not signed in." };

  const { data: treeRows, error: treeError } = await supabase.rpc("get_tree_by_token", {
    p_token: input.token,
  });
  const tree = (Array.isArray(treeRows) ? treeRows[0] : treeRows) as Tree | undefined;
  if (treeError || !tree) return { outcome: "error", message: "Tree not found." };

  const { data, error } = await supabase.rpc("claim_or_create_person", {
    p_tree_id: tree.id,
    p_full_name: input.fullName,
    p_birth_date: input.birthDate,
    p_email: input.email,
    p_phone: input.phone,
  });

  if (error) return { outcome: "error", message: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = row?.outcome as string | undefined;
  const personId = row?.person_id as string | null;

  if ((outcome === "claimed" || outcome === "attached") && personId) {
    if (outcome === "claimed" && tree.owner_id !== user.id) {
      await supabase.from("notifications").insert({
        tree_id: tree.id,
        recipient_id: tree.owner_id,
        message: `${input.fullName} joined the tree by claiming their profile.`,
      });
    }
    return { outcome, personId };
  }

  return { outcome: "new" };
}
