export default function SetupNotice() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Supabase is not configured.</p>
      <p className="mt-1">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>{" "}
        (see <code>.env.example</code>) and apply the migration in{" "}
        <code>supabase/migrations/0001_init.sql</code>.
      </p>
    </div>
  );
}
