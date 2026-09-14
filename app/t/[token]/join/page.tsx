import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JoinForm from "@/components/JoinForm";
import SetupNotice from "@/components/SetupNotice";
import type { Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JoinPage({
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

  return (
    <main className="mx-auto max-w-md p-6 pt-10">
      <h1 className="text-2xl font-bold">Join {tree.name}</h1>
      <p className="mt-2 text-sm text-stone-600">
        Enter your details below. If the tree already has a profile for you,
        you&apos;ll claim it; otherwise you&apos;ll add yourself.
      </p>
      <div className="mt-6">
        <JoinForm token={token} treeName={tree.name} />
      </div>
    </main>
  );
}
