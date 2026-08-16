import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TreeCanvas from "@/components/TreeCanvas";
import AddRelativeForm from "@/components/AddRelativeForm";
import SetupNotice from "@/components/SetupNotice";
import type { Person, Relationship, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

// Mobile tree viewer: pan/zoom SVG pedigree, tap a person for details.
// The owner also gets the add-relative form and move/remove moderation.
export default async function ViewTreePage({
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

  const { data: treeData } = await supabase.rpc("get_tree_by_token", { p_token: token });
  const tree = (Array.isArray(treeData) ? treeData[0] : treeData) as Tree | undefined;
  if (!tree) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === tree.owner_id;

  const { data } = await supabase.rpc("get_tree_data", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  const persons = (row?.persons ?? []) as Person[];
  const relationships = (row?.relationships ?? []) as Relationship[];

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-xl font-bold">{tree.name}</h1>
        <Link href={`/t/${token}`} className="shrink-0 text-sm text-stone-600 underline">
          Tree home
        </Link>
      </div>

      {isOwner && <AddRelativeForm token={token} persons={persons} />}

      <TreeCanvas
        token={token}
        persons={persons}
        relationships={relationships}
        isOwner={isOwner}
      />

      <p className="text-xs text-stone-600">
        Drag to pan, pinch or scroll to zoom, tap a person for details.
      </p>
    </main>
  );
}
