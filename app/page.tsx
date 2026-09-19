import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeHeader from "@/components/HomeHeader";
import TreeCard from "@/components/TreeCard";
import type { Notification, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  let myTrees: Tree[] = [];
  let feed: Notification[] = [];
  let avatarUrl: string | null = null;
  if (supabase && user) {
    const [{ data: trees }, { data: notifications }, { data: profile }] = await Promise.all([
      // Owner-or-member trees (RLS unions trees_owner_select with
      // trees_member_select), newest first.
      supabase.from("trees").select("*").order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
    ]);
    myTrees = (trees ?? []) as Tree[];
    feed = (notifications ?? []) as Notification[];
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <div className="min-h-screen">
      <HomeHeader avatarUrl={avatarUrl} notifications={feed} />

      <main className="mx-auto flex max-w-md flex-col gap-8 p-6 py-10">
        <p className="text-stone-600">
          Build your family tree together. Create a tree, share one link, and
          let family members add themselves.
        </p>

        {user && (
          <section>
            <h2 className="text-lg font-semibold">My trees</h2>

            {/* 4:3 tiles — room for template cards to join the "+" tile here later. */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Link href="/tree/new" className="block">
                <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-400 transition-colors active:bg-stone-50">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-7 w-7"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="truncate text-xs font-medium text-stone-500">New tree</span>
                </span>
              </Link>
            </div>

            {myTrees.length > 0 && (
              <ul className="mt-4 space-y-3">
                {myTrees.map((tree) => (
                  <TreeCard key={tree.id} tree={tree} isOwner={tree.owner_id === user.id} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
