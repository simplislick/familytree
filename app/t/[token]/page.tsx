import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CopyButton from "@/components/CopyButton";
import SetupNotice from "@/components/SetupNotice";
import type { Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

// Shared-link entry point: shows the tree name and routes visitors to join
// or view. The owner additionally gets the share-link copy button.
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-sm text-stone-500">You&apos;ve been invited to</p>
        <h1 className="mt-1 text-3xl font-bold">{tree.name}</h1>
      </div>

      {isOwner && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-medium">Share this link with family:</p>
          <p className="mt-1 truncate text-xs text-stone-500">/t/{tree.share_token}</p>
          <div className="mt-3">
            <CopyButton text={`/t/${tree.share_token}`} />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!isOwner && (
          <Link
            href={`/t/${token}/join`}
            className="block min-h-12 rounded-lg bg-stone-800 px-4 py-3 text-center font-medium text-white"
          >
            Join this tree
          </Link>
        )}
        <Link
          href={`/t/${token}/view`}
          className="block min-h-12 rounded-lg border border-stone-300 bg-white px-4 py-3 text-center font-medium text-stone-800"
        >
          View the tree
        </Link>
        {isOwner && (
          <Link href="/dashboard" className="block text-center text-sm text-stone-500 underline">
            Back to dashboard
          </Link>
        )}
      </div>
    </main>
  );
}
