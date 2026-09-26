import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TreeHome from "@/components/TreeHome";
import SetupNotice from "@/components/SetupNotice";
import type { Branch, Person, Relationship, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

// Shared-link entry point: shows the tree immediately under a navbar
// (add-relative / tree name / share). Non-owners get a join prompt instead.
export default async function TreeEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-md p-6 pt-16">
        <SetupNotice />
      </main>
    );
  }

  const { data } = await supabase.rpc("get_tree_by_token", { p_token: token });
  const tree = (Array.isArray(data) ? data[0] : data) as Tree | undefined;
  if (!tree) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === tree.owner_id;

  const { data: treeData } = await supabase.rpc("get_tree_data", { p_token: token });
  const row = Array.isArray(treeData) ? treeData[0] : treeData;
  const persons = (row?.persons ?? []) as Person[];
  const relationships = (row?.relationships ?? []) as Relationship[];

  // Branches are an owner-only list-view tool; RLS limits reads to the owner.
  let branches: Branch[] = [];
  if (isOwner) {
    const { data: branchRows } = await supabase
      .from("branches")
      .select("*")
      .eq("tree_id", tree.id)
      .order("created_at");
    branches = (branchRows ?? []) as Branch[];
  }

  return (
    <TreeHome
      token={token}
      treeName={tree.name}
      shareToken={tree.share_token}
      isOwner={isOwner}
      persons={persons}
      relationships={relationships}
      branches={branches}
    />
  );
}
