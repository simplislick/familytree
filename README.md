# Family Tree Platform (MVP)

Mobile-first web app for building shareable family trees. Create a tree, share
one link, and family members join by email magic link or phone OTP — matching
an existing placeholder profile (claim) or positioning themselves manually.
The tree owner gets notified and can move or remove anyone.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres (RLS) + Auth (email magic link, phone OTP)
- No graph library: the tree is a custom SVG pedigree (`components/TreeCanvas.tsx`,
  layout in `lib/tree-layout.ts`)

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Apply the schema:

   ```sh
   supabase link --project-ref <your-ref>
   supabase db push
   ```

   Or paste `supabase/migrations/0001_init.sql` into the SQL editor.

3. Copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → Data API / API Keys).
4. Enable auth providers in Supabase:
   - **Email** works out of the box (magic link). Add
     `http://localhost:3000/auth/callback` to the allowed redirect URLs.
   - **Phone OTP** requires an SMS provider (e.g. Twilio) configured under
     Authentication → Providers → Phone. Until then, use email.
5. (Optional) Seed a demo tree: sign up once in the app, then run
   `scripts/seed.sql` in the SQL editor. The demo tree lives at
   `/t/demo-share-token` and includes claimable placeholders
   (`grandma@example.com`, `+1 555 123 4567`).
6. Run:

   ```sh
   npm install
   npm run dev
   ```

The app builds without env vars set (pages show a "Supabase not configured"
notice), so `npm run build` works before a project exists.

## Core flows

1. **Create tree:** sign in with your email → name the tree → get a shareable
   `/t/[token]` link with a copy button.
2. **Join via link:** enter name, birth date, and choose email (magic link) or
   phone (OTP). After verification, `claim_or_create_person` (a single
   transactional Postgres function) matches on exact email or normalized phone:
   - placeholder match → claimed, land on the tree view
   - existing account match → attached
   - no match → manual self-positioning ("I'm the child/spouse/parent of …")
3. **Owner moderation:** dashboard notification feed; open the tree to add
   placeholder relatives, move a person to a different relationship, or remove
   them.
4. **View tree:** touch-friendly SVG pedigree — drag to pan, pinch/scroll to
   zoom, tap a person for details.

## Data model

`trees` (share_token drives `/t/[token]`), `persons` (`user_id` null =
unclaimed placeholder), `relationships` (`parent` / `spouse` edges; child and
sibling relations are derived), `notifications` (owner feed). All tables are
RLS-protected; shared-link reads go through security-definer RPCs
(`get_tree_by_token`, `get_tree_data`).

## Out of scope for MVP

No photos, events, member profile editing beyond self-positioning, or
merge-duplicate UI (owner "remove" covers it).

## Deploy

Target is Vercel: push the repo, import it, and set the two env vars above.
Add your production `/auth/callback` URL to Supabase's allowed redirect URLs.
