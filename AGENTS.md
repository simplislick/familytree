# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

Family Tree Platform (MVP): a mobile-first web app for building shareable
family trees. There is no sign-in screen: every visitor gets a silent
anonymous Supabase Auth session on first load, and can optionally sign in
with an emailed magic link (Settings overlay on the home page) so their trees
follow them across browsers. A user creates a tree and
shares one `/t/[token]` link; family members join by submitting their name
(and optionally email/phone, used only for matching), which either claims an
existing placeholder profile or positions them manually relative to an
existing person. The tree owner moderates via a notification feed and can
add, move, connect, or remove people.

- **Stack:** Next.js 15 (App Router, Turbopack) + React 19 + TypeScript +
  Tailwind CSS v4 (via PostCSS plugin).
- **Backend:** Supabase — Postgres with Row Level Security, Supabase Auth
  (silent anonymous sessions, plus optional email magic-link sign-in), and
  Supabase Storage (public
  `person-photos` bucket). There is no custom API layer: data access is direct
  `supabase-js` calls from Server Components and Server Actions, plus
  security-definer SQL RPCs for shared-link reads and the match-and-claim
  transaction.
- **Tree rendering:** no graph library. The pedigree is a custom SVG canvas
  (`components/TreeCanvas.tsx`) with layout computed in `lib/tree-layout.ts`.
  Nodes expose three "ports" (parent/child/spouse) and are wired together by
  dragging, ComfyUI-style.

## Build and run commands

```sh
npm install
npm run dev      # next dev --turbopack
npm run build    # next build --turbopack (works without env vars set)
npm start        # production server
npm run lint     # eslint (flat config: next/core-web-vitals + next/typescript)
```

There is no test suite, no formatter script, and no CI configuration in the
repo. Verify changes with `npm run lint` and `npm run build` (the latter type-
checks the whole app). The build succeeds without Supabase env vars — pages
render a "Supabase not configured" notice (`components/SetupNotice.tsx`).

## Required environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The Supabase client factories (`lib/supabase/server.ts`, `lib/supabase/client.ts`)
return `null` when these are unset, and **every caller must handle null**.

## Database

Schema lives in numbered migrations under `supabase/migrations/`
(`0001_init.sql` = tables/RLS/RPCs, `0002` = photos + storage bucket,
`0003`/`0004` = placed-person canvas columns, `0005` = lets members read the
trees they belong to, not just owners, `0006` = per-account `profiles` table
for the settings-page avatar, `0010` = owner-only `branches` table for
list-view branches). Apply with the Supabase CLI
(`supabase link --project-ref <ref>` then `supabase db push`) or by pasting
into the SQL editor. `scripts/seed.sql` seeds a demo tree (requires an
existing user) and is run manually in the SQL editor.

Key data model points (see `lib/types.ts` for the TS mirror):

- `trees.share_token` drives all `/t/[token]` routes.
- `persons.user_id IS NULL` means an unclaimed placeholder profile.
- `relationships` stores only `parent` and `spouse` edges; child/sibling
  relations are derived. A `parent` edge means `related_person_id` is a
  parent of `person_id`.
- `persons.placed` + `position_x/y` support freeform canvas placement for
  unconnected people; the pedigree layout takes over once connected.
- All tables have RLS. Shared-link (anonymous) reads go through the
  security-definer RPCs `get_tree_by_token` and `get_tree_data`.
  `claim_or_create_person` performs the match-and-claim atomically inside
  Postgres — do not reimplement it client-side.

## Code organization

- `app/` — App Router pages: `page.tsx` (home: my trees + notifications),
  `tree/new` (create), `t/[token]` (tree view), `t/[token]/join` and
  `t/[token]/position` (join flow), `auth/callback/route.ts` (magic-link
  landing: exchanges the emailed code for a session).
- `lib/actions.ts` — all Server Actions (prefixed `"use server"`): tree
  create/rename, `addRelative`, `placePerson`, `connectPersons`,
  `disconnectPersons`, `movePerson`, `removePerson`, `updatePersonPhoto`,
  notification read, `sendSignInLink`/`signOut`. They return `ActionResult` (`{ ok, message? }`) except
  `createTree`, which `redirect()`s. Every action re-checks ownership via the
  tree's `owner_id` — keep that pattern when adding actions.
- `lib/matching.ts` — `completeJoin` Server Action wrapping the
  `claim_or_create_person` RPC.
- `lib/supabase/middleware.ts` — refreshes the Supabase session on every
  request and silently calls `signInAnonymously()` when there is no user, so
  no page ever needs to show a sign-in screen.
- `lib/tree-layout.ts` — pure layout math: layered pedigree (generations by
  parent-edge depth, spouses as adjacent units), unconnected/placed-person
  filtering, grid snapping. Constants (`NODE_WIDTH`, `NODE_HEIGHT`,
  `GRID_CELL_*`) are shared with the canvas.
- `lib/photo-upload.ts` — client-side upload to the `person-photos` bucket.
- `lib/supabase/` — `client.ts` (browser), `server.ts` (server, cookie-based,
  returns `Promise<SupabaseClient | null>`), `middleware.ts` (session refresh,
  wired from `middleware.ts` at the project root).
- `components/` — UI, all client components. `TreeCanvas.tsx` (~900 lines) is
  the interactive SVG canvas: pan/zoom, tap for details, node dragging with
  grid snap, generation bands, and the unconnected-members drawer. It
  draws couple lines (solid for spouses, dotted for list-view branch parents
  with no spouse edge; arcs outside generation 1) and parent-child elbows
  from the couple line's midpoint to the top of the child's avatar.

## Conventions

- **Language/comments/docs:** English throughout.
- TypeScript strict mode; path alias `@/*` maps to the project root.
- Server Components by default; add `"use client"` only for interactive
  components. Server Actions live in `lib/actions.ts` (or `lib/matching.ts`
  for join), never inline in components except trivial form wrappers that
  forward `FormData`.
- After a mutation, call `revalidatePath("/t/[token]")` (or `/` for the
  notification feed) so Server Components refresh.
- UI is Tailwind utility classes, `stone` palette, mobile-first with
  `min-h-11`/`min-h-12` tap targets. No component library.
- Forms use uncontrolled `<form action={...}>` with `FormData` where
  possible; richer flows (join, position) use controlled client state.
- IDs: UUIDs from Postgres; share tokens are `nanoid(10)`.
- RPC results are handled defensively: `Array.isArray(data) ? data[0] : data`,
  because Supabase returns rows differently for set-returning functions.

## Security considerations

- Authorization is enforced **twice**: in Server Actions (owner checks against
  `tree.owner_id`) and in Postgres RLS policies. Never rely on the UI hiding
  controls — always re-check in the action.
- Shared-link pages (`/t/[token]`) are readable by anonymous visitors by
  design, via the `get_tree_*` RPCs. Person photos are in a public bucket for
  the same reason. Do not add per-user data to `get_tree_data` output.
- Only the anon Supabase key ships to the browser; there is no service-role
  key in the app. Sensitive logic that must bypass RLS belongs in
  `security definer` SQL functions with `set search_path = public`.
- Env files (`.env`, `.env.local`) must never be committed.

## Deployment

Target is Vercel: push the repo, import it, and set the two `NEXT_PUBLIC_*`
env vars. Anonymous sign-ins must be enabled in the Supabase project's
Authentication settings, and each deployed origin's `/auth/callback` must be
listed under Authentication → URL Configuration → Redirect URLs for magic
links to work.
