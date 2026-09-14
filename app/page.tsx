import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markNotificationRead } from "@/lib/actions";
import TreeNavbar from "@/components/TreeNavbar";
import TreeCard from "@/components/TreeCard";
import PersonAvatar from "@/components/PersonAvatar";
import type { Notification, Person, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

// The signed-in user's identity, as claimed in one of their trees — there's
// no standalone profile table, so "my profile" is derived from the persons
// row(s) linked to this auth user via user_id.
type Identity = Person & { trees: { name: string } | null };

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  let myTrees: Tree[] = [];
  let feed: Notification[] = [];
  let identities: Identity[] = [];
  if (supabase && user) {
    const [{ data: trees }, { data: notifications }, { data: persons }] = await Promise.all([
      // Owner-or-member trees (RLS unions trees_owner_select with
      // trees_member_select), newest first.
      supabase.from("trees").select("*").order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("persons")
        .select("*, trees(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    myTrees = (trees ?? []) as Tree[];
    feed = (notifications ?? []) as Notification[];
    identities = (persons ?? []) as Identity[];
  }

  const profile = identities[0] ?? null;

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
        {user && (
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
        )}

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
              <h2 className="text-lg font-semibold">My profile</h2>
              {profile ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
                  <PersonAvatar name={profile.full_name} photoUrl={profile.photo_url} size={56} />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-stone-900">
                      {profile.full_name}
                    </p>
                    {profile.trees && (
                      <p className="truncate text-xs text-stone-600">
                        As seen in {profile.trees.name}
                        {identities.length > 1 ? ` and ${identities.length - 1} more` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">
                  You haven&apos;t joined a tree yet — join one to set up your profile.
                </p>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold">My trees</h2>
              <ul className="mt-3 space-y-3">
                <li>
                  <Link href="/tree/new" className="block">
                    <span className="flex h-28 w-full items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-stone-400 transition-colors active:bg-stone-50">
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
                    </span>
                    <span className="mt-2 block text-sm font-medium text-stone-700">New tree</span>
                  </Link>
                </li>
                {myTrees.map((tree) => (
                  <TreeCard key={tree.id} tree={tree} isOwner={tree.owner_id === user.id} />
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
