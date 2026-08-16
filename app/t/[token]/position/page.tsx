import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PositionPicker from "@/components/PositionPicker";
import SetupNotice from "@/components/SetupNotice";
import type { Person, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

// Manual self-positioning for joiners who didn't match any existing profile.
export default async function PositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ name?: string; birthDate?: string }>;
}) {
  const { token } = await params;
  const { name = "", birthDate = "" } = await searchParams;
  const supabase = await createClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-md p-6 pt-16">
        <SetupNotice />
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/t/${token}/join`);

  const { data: treeData } = await supabase.rpc("get_tree_by_token", { p_token: token });
  const tree = (Array.isArray(treeData) ? treeData[0] : treeData) as Tree | undefined;
  if (!tree) notFound();

  const { data } = await supabase.rpc("get_tree_data", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  const persons = ((row?.persons ?? []) as Person[]).filter((p) => p.user_id !== user.id);

  return (
    <main className="mx-auto max-w-md p-6 pt-10">
      <h1 className="text-2xl font-bold">Where do you fit in {tree.name}?</h1>
      <p className="mt-2 text-sm text-stone-600">
        We didn&apos;t find an existing profile for you. Pick someone you&apos;re
        related to and how — the tree owner can adjust it later.
      </p>
      <div className="mt-6">
        {persons.length === 0 ? (
          <p className="text-sm text-stone-600">
            This tree is empty — ask the owner to add the first relatives.
          </p>
        ) : (
          <PositionPicker
            token={token}
            persons={persons}
            defaultName={name}
            defaultBirthDate={birthDate}
          />
        )}
      </div>
    </main>
  );
}
