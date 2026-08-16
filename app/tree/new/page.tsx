import { createClient } from "@/lib/supabase/server";
import { createTree } from "@/lib/actions";
import AuthForm from "@/components/AuthForm";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NewTreePage() {
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

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-6 pt-16">
        <h1 className="text-2xl font-bold">Sign in to create a tree</h1>
        <p className="mt-2 text-sm text-stone-600">
          We&apos;ll email you a sign-in link — no password needed.
        </p>
        <div className="mt-6">
          <AuthForm next="/tree/new" />
        </div>
      </main>
    );
  }

  async function action(formData: FormData) {
    "use server";
    await createTree(String(formData.get("name") ?? ""));
  }

  return (
    <main className="mx-auto max-w-md p-6 pt-16">
      <h1 className="text-2xl font-bold">Name your tree</h1>
      <form action={action} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Tree name
          <input
            type="text"
            name="name"
            required
            placeholder="The Okafor Family"
            className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white"
        >
          Create tree
        </button>
      </form>
    </main>
  );
}
