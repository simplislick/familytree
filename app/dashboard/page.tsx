import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markNotificationRead } from "@/lib/actions";
import CopyButton from "@/components/CopyButton";
import SetupNotice from "@/components/SetupNotice";
import type { Notification, Tree } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
  if (!user) redirect("/");

  const [{ data: trees }, { data: notifications }] = await Promise.all([
    supabase.from("trees").select("*").order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const ownedTrees = (trees ?? []) as Tree[];
  const feed = (notifications ?? []) as Notification[];

  async function markRead(formData: FormData) {
    "use server";
    await markNotificationRead(String(formData.get("id")));
  }

  return (
    <main className="mx-auto max-w-md space-y-8 p-6 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My trees</h1>
        <Link
          href="/tree/new"
          className="min-h-11 rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-medium text-white"
        >
          + New tree
        </Link>
      </div>

      {ownedTrees.length === 0 ? (
        <p className="text-sm text-stone-500">You haven&apos;t created any trees yet.</p>
      ) : (
        <ul className="space-y-3">
          {ownedTrees.map((tree) => {
            const sharePath = `/t/${tree.share_token}`;
            return (
              <li key={tree.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <Link href={sharePath} className="text-lg font-semibold">
                  {tree.name}
                </Link>
                <p className="mt-1 truncate text-xs text-stone-500">{sharePath}</p>
                <div className="mt-3 flex gap-2">
                  <CopyButton text={sharePath} />
                  <Link
                    href={`${sharePath}/view`}
                    className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium"
                  >
                    View tree
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <h2 className="text-lg font-semibold">Notifications</h2>
        {feed.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No activity yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {feed.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border p-3 text-sm ${
                  n.read
                    ? "border-stone-200 bg-white text-stone-500"
                    : "border-stone-300 bg-stone-100 text-stone-900"
                }`}
              >
                <p>{n.message}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-stone-400">
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
    </main>
  );
}
