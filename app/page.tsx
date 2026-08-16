import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Family Tree</h1>
        <p className="mt-2 text-stone-600">
          Build your family tree together. Create a tree, share one link, and
          let family members add themselves.
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/tree/new"
          className="block min-h-12 rounded-lg bg-stone-800 px-4 py-3 text-center font-medium text-white"
        >
          Create a family tree
        </Link>
        {user && (
          <Link
            href="/dashboard"
            className="block min-h-12 rounded-lg border border-stone-300 bg-white px-4 py-3 text-center font-medium text-stone-800"
          >
            My dashboard
          </Link>
        )}
      </div>

      <p className="text-sm text-stone-600">
        Have a share link? Open it to join or view the tree — it looks like{" "}
        <code>/t/your-tree-token</code>.
      </p>
    </main>
  );
}
