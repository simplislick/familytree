import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markNotificationRead } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";
import TreeNavbar from "@/components/TreeNavbar";
import type { Notification, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  let ownedTrees: Tree[] = [];
  let feed: Notification[] = [];
  if (supabase && user) {
    const [{ data: trees }, { data: notifications }] = await Promise.all([
      supabase.from("trees").select("*").order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    ownedTrees = (trees ?? []) as Tree[];
    feed = (notifications ?? []) as Notification[];
  }

  async function markRead(formData: FormData) {
    "use server";
    await markNotificationRead(String(formData.get("id")));
  }

  return (
    <div className="min-h-screen">
      <TreeNavbar
        token=""
        treeName="Family Tree"
        isOwner={false}
        showAdd={false}
        shareText=""
        showShare={false}
      />

      <main className="mx-auto flex max-w-md flex-col gap-8 p-6 py-10">
        <p className="text-stone-600">
          Build your family tree together. Create a tree, share one link, and
          let family members add themselves.
        </p>

        <div className="space-y-3">
          <Link
            href="/tree/new"
            className="block min-h-12 rounded-lg bg-stone-800 px-4 py-3 text-center font-medium text-white"
          >
            Create a family tree
          </Link>
        </div>

        {user && (
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold">My trees</h2>
              {ownedTrees.length === 0 ? (
                <p className="mt-2 text-sm text-stone-600">You haven&apos;t created any trees yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {ownedTrees.map((tree) => {
                    const sharePath = `/t/${tree.share_token}`;
                    return (
                      <li key={tree.id} className="rounded-xl border border-stone-200 bg-white p-4">
                        <Link href={sharePath} className="text-lg font-semibold text-stone-900">
                          {tree.name}
                        </Link>
                        <p className="mt-1 truncate text-xs text-stone-600">{sharePath}</p>
                        <div className="mt-3 flex gap-2">
                          <CopyButton text={sharePath} />
                          <Link
                            href={sharePath}
                            className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800"
                          >
                            View tree
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold">Notifications</h2>
              {feed.length === 0 ? (
                <p className="mt-2 text-sm text-stone-600">No activity yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {feed.map((n) => (
                    <li
                      key={n.id}
                      className={`rounded-lg border p-3 text-sm ${
                        n.read
                          ? "border-stone-200 bg-white text-stone-600"
                          : "border-stone-300 bg-stone-100 text-stone-900"
                      }`}
                    >
                      <p>{n.message}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-stone-600">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                        {!n.read && (
                          <form action={markRead}>
                            <input type="hidden" name="id" value={n.id} />
                            <button type="submit" className="min-h-11 px-2 text-xs font-medium text-stone-600 underline">
                              Mark read
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <p className="text-sm text-stone-600">
          Have a share link? Open it to join or view the tree — it looks like{" "}
          <code>/t/your-tree-token</code>.
        </p>
      </main>
    </div>
  );
}
