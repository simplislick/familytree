"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import type { JoinRelation, RelationType, Tree } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function getAuthedClient() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function getTreeByToken(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  token: string,
): Promise<Tree | null> {
  const { data } = await supabase.rpc("get_tree_by_token", { p_token: token });
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

/** Owner creates a tree; generates the share token and redirects to it. */
export async function createTree(name: string) {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!user) throw new Error("Not signed in.");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Please enter a tree name.");

  const token = nanoid(10);
  const { error } = await supabase.from("trees").insert({
    name: trimmed,
    owner_id: user.id,
    share_token: token,
  });
  if (error) throw new Error(error.message);

  redirect(`/t/${token}`);
}

/** Owner renames their tree. */
export async function renameTree(token: string, name: string): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can rename the tree." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Please enter a tree name." };

  const { error } = await supabase.from("trees").update({ name: trimmed }).eq("id", tree.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/t/${token}`);
  return { ok: true };
}

/**
 * Unmatched joiner positions themselves: creates their person row plus the
 * relationship edge to an existing anchor person, and notifies the owner.
 */
export async function positionSelf(input: {
  token: string;
  anchorPersonId: string;
  relation: JoinRelation;
  fullName: string;
  birthDate: string | null;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, message: "Please enter your name." };

  const { data: person, error: personError } = await supabase
    .from("persons")
    .insert({
      tree_id: tree.id,
      user_id: user.id,
      full_name: fullName,
      birth_date: input.birthDate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (personError || !person) {
    return { ok: false, message: personError?.message ?? "Could not add you to the tree." };
  }

  const edge = relationshipFor(input.relation, person.id, input.anchorPersonId);
  const { error: relError } = await supabase.from("relationships").insert({
    tree_id: tree.id,
    ...edge,
    created_by: user.id,
  });
  if (relError) return { ok: false, message: relError.message };

  if (tree.owner_id !== user.id) {
    await supabase.from("notifications").insert({
      tree_id: tree.id,
      recipient_id: tree.owner_id,
      message: `${fullName} joined the tree and positioned themselves.`,
    });
  }

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/**
 * Owner adds a relative. If an anchor person + relation are given, the new
 * person is linked to them; otherwise the person is created unconnected
 * (shown in its own section of the tree until the owner moves them in).
 */
export async function addRelative(input: {
  token: string;
  anchorPersonId: string | null;
  relation: JoinRelation | null;
  fullName: string;
  birthDate: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can add relatives." };

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, message: "Please enter a name." };

  const { data: person, error: personError } = await supabase
    .from("persons")
    .insert({
      tree_id: tree.id,
      user_id: null,
      full_name: fullName,
      birth_date: input.birthDate,
      photo_url: input.photoUrl,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (personError || !person) {
    return { ok: false, message: personError?.message ?? "Could not add the relative." };
  }

  if (input.anchorPersonId && input.relation) {
    const edge = relationshipFor(input.relation, person.id, input.anchorPersonId);
    const { error: relError } = await supabase.from("relationships").insert({
      tree_id: tree.id,
      ...edge,
      created_by: user.id,
    });
    if (relError) return { ok: false, message: relError.message };
  }

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/**
 * Owner drops an unconnected person onto the tree canvas. No relation yet —
 * they show in the canvas grid until dragged onto an existing node.
 */
export async function placePerson(input: {
  token: string;
  personId: string;
  x: number;
  y: number;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can place people." };

  const { error } = await supabase
    .from("persons")
    .update({ placed: true, position_x: Math.round(input.x), position_y: Math.round(input.y) })
    .eq("id", input.personId)
    .eq("tree_id", tree.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/**
 * Owner drags a wire between two existing people's connection points,
 * ComfyUI-style. Adds exactly one edge — unlike `movePerson`, it leaves the
 * rest of both people's connections untouched, since a person can have
 * multiple parents, children, and a spouse at once.
 */
export async function connectPersons(input: {
  token: string;
  personId: string;
  relatedPersonId: string;
  type: RelationType;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };
  if (input.personId === input.relatedPersonId) {
    return { ok: false, message: "A person can't be connected to themself." };
  }

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can connect people." };

  const { data: existing } = await supabase
    .from("relationships")
    .select("id")
    .eq("tree_id", tree.id)
    .eq("type", input.type)
    .eq("person_id", input.personId)
    .eq("related_person_id", input.relatedPersonId)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("relationships").insert({
      tree_id: tree.id,
      person_id: input.personId,
      related_person_id: input.relatedPersonId,
      type: input.type,
      created_by: user.id,
    });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/** Owner unplugs one connection point — removes a single relationship edge. */
export async function disconnectPersons(input: {
  token: string;
  relationshipId: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can disconnect people." };

  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", input.relationshipId)
    .eq("tree_id", tree.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/** Owner moves a person: replaces their parent/spouse edges with a new one. */
export async function movePerson(input: {
  token: string;
  personId: string;
  anchorPersonId: string;
  relation: JoinRelation;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can move people." };

  const { error: deleteError } = await supabase
    .from("relationships")
    .delete()
    .eq("tree_id", tree.id)
    .or(`person_id.eq.${input.personId},related_person_id.eq.${input.personId}`);
  if (deleteError) return { ok: false, message: deleteError.message };

  const edge = relationshipFor(input.relation, input.personId, input.anchorPersonId);
  const { error: relError } = await supabase.from("relationships").insert({
    tree_id: tree.id,
    ...edge,
    created_by: user.id,
  });
  if (relError) return { ok: false, message: relError.message };

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/** Owner removes a person; their relationship edges cascade-delete. */
export async function removePerson(input: {
  token: string;
  personId: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };
  if (tree.owner_id !== user.id) return { ok: false, message: "Only the owner can remove people." };

  const { error } = await supabase
    .from("persons")
    .delete()
    .eq("id", input.personId)
    .eq("tree_id", tree.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

/** Owner or the person themself sets a person's profile photo. */
export async function updatePersonPhoto(input: {
  token: string;
  personId: string;
  photoUrl: string | null;
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const tree = await getTreeByToken(supabase, input.token);
  if (!tree) return { ok: false, message: "Tree not found." };

  const { data: person } = await supabase
    .from("persons")
    .select("user_id")
    .eq("id", input.personId)
    .eq("tree_id", tree.id)
    .maybeSingle();
  if (!person) return { ok: false, message: "Person not found." };
  if (tree.owner_id !== user.id && person.user_id !== user.id) {
    return { ok: false, message: "You can only change your own photo." };
  }

  const { error } = await supabase
    .from("persons")
    .update({ photo_url: input.photoUrl })
    .eq("id", input.personId)
    .eq("tree_id", tree.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/t/${input.token}`);
  return { ok: true };
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuthedClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true };
}

// Maps a joiner's chosen relation to the stored edge. A 'parent' edge means
// related_person_id is a parent of person_id.
function relationshipFor(
  relation: JoinRelation,
  newPersonId: string,
  anchorPersonId: string,
): { person_id: string; related_person_id: string; type: "parent" | "spouse" } {
  switch (relation) {
    case "child": // new person is the child of the anchor
      return { person_id: newPersonId, related_person_id: anchorPersonId, type: "parent" };
    case "parent": // new person is a parent of the anchor
      return { person_id: anchorPersonId, related_person_id: newPersonId, type: "parent" };
    case "spouse":
      return { person_id: newPersonId, related_person_id: anchorPersonId, type: "spouse" };
  }
}
