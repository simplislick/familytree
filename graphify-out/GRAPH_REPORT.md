# Graph Report - familytree  (2026-09-14)

## Corpus Check
- Corpus is ~15,213 words - fits in a single context window. You may not need a graph.

## Summary
- 266 nodes · 517 edges · 22 communities (10 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 196,446 output

## Community Hubs (Navigation)
- App Config & Layout
- Route Pages
- Product Concepts & Docs
- Relative & Person Forms
- Tree Canvas Rendering
- Tree Canvas Interactions
- Core DB Schema & RPCs
- TypeScript Config
- Dev Dependencies
- Tree Navbar & Sharing
- PostCSS Config
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- Person Photos Migration (Table Ref)
- Person Placement Migration (Table Ref)
- Person Position Migration (Table Ref)

## God Nodes (most connected - your core abstractions)
1. `TreeCanvas()` - 33 edges
2. `compilerOptions` - 16 edges
3. `createClient()` - 15 edges
4. `getAuthedClient()` - 13 edges
5. `movePerson()` - 11 edges
6. `getTreeByToken()` - 10 edges
7. `react` - 10 edges
8. `public.persons` - 10 edges
9. `PersonCard()` - 9 edges
10. `public.trees` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Custom SVG Pedigree Canvas` --rationale_for--> `TreeCanvas()`  [EXTRACTED]
  AGENTS.md → components/TreeCanvas.tsx
- `completeJoin()` --references--> `claim_or_create_person (RPC)`  [EXTRACTED]
  lib/matching.ts → AGENTS.md
- `handleSubmit()` --calls--> `positionSelf()`  [EXTRACTED]
  components/PositionPicker.tsx → lib/actions.ts
- `handleConnect()` --calls--> `movePerson()`  [EXTRACTED]
  components/TreeCanvas.tsx → lib/actions.ts
- `handleDisconnect()` --calls--> `disconnectPersons()`  [EXTRACTED]
  components/TreeCanvas.tsx → lib/actions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server Actions Ownership-Checked Mutation Pattern** — lib_actions, lib_actions_addrelative, lib_actions_placeperson, lib_actions_connectpersons, lib_actions_disconnectpersons, lib_actions_moveperson, lib_actions_removeperson, lib_actions_updatepersonphoto, lib_actions_createtree, concept_dual_authorization [EXTRACTED 1.00]
- **Anonymous Auth Session Flow** — concept_anonymous_auth_session, lib_supabase_middleware, lib_supabase_server, lib_supabase_client [EXTRACTED 1.00]
- **Shared-Link Anonymous Read Path** — concept_security_definer_rpc, supabase_migrations_0001_init_get_tree_by_token, supabase_migrations_0001_init_get_tree_data, app_t__token__page_page [EXTRACTED 1.00]

## Communities (22 total, 9 thin omitted)

### Community 0 - "App Config & Layout"
Cohesion: 0.05
Nodes (35): metadata, viewport, compat, __dirname, eslintConfig, __filename, nextConfig, dependencies (+27 more)

### Community 1 - "Route Pages"
Cohesion: 0.11
Nodes (27): dynamic, Home(), markRead(), dynamic, JoinPage(), dynamic, TreeEntryPage(), dynamic (+19 more)

### Community 2 - "Product Concepts & Docs"
Cohesion: 0.10
Nodes (27): app/t/[token]/join (join flow page), app/t/[token] (tree view page), app/t/[token]/position (self-positioning page), app/tree/new (create tree page), Silent Anonymous Auth Session, Double Authorization Enforcement, Family Tree Platform (MVP), Freeform Canvas Placement (+19 more)

### Community 3 - "Relative & Person Forms"
Cohesion: 0.17
Nodes (26): AddRelativeForm(), handlePhotoChange(), handleSubmit(), setOpen(), initialsFor(), PersonAvatar(), PersonCard(), handleMove() (+18 more)

### Community 4 - "Tree Canvas Rendering"
Cohesion: 0.11
Nodes (27): AvatarNode(), ConnectPrompt, DisconnectPrompt, Drag, initials(), PersonTile(), Point, Port (+19 more)

### Community 5 - "Tree Canvas Interactions"
Cohesion: 0.14
Nodes (16): portPosition(), TreeCanvas(), clampScale(), handleConnect(), handleDisconnect(), handleDragEnd(), handleDragMove(), handlePointerMove() (+8 more)

### Community 6 - "Core DB Schema & RPCs"
Cohesion: 0.23
Nodes (17): auth.users, notifications_recipient_idx, persons_email_idx, persons_tree_id_idx, persons_user_id_idx, public.claim_or_create_person(), public.get_tree_by_token(), public.get_tree_data() (+9 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 8 - "Dev Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, @eslint/eslintrc, tailwindcss, @tailwindcss/oxide-linux-x64-gnu, @tailwindcss/postcss, @types/node (+3 more)

### Community 9 - "Tree Navbar & Sharing"
Cohesion: 0.29
Nodes (5): ShareButton(), TreeHome(), TreeNavbar(), handleSave(), react

## Knowledge Gaps
- **91 isolated node(s):** `metadata`, `viewport`, `dynamic`, `dynamic`, `dynamic` (+86 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 108 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Tree Navbar & Sharing` to `App Config & Layout`, `Route Pages`, `Relative & Person Forms`, `Tree Canvas Rendering`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `TreeCanvas()` connect `Tree Canvas Interactions` to `Tree Navbar & Sharing`, `Product Concepts & Docs`, `Relative & Person Forms`, `Tree Canvas Rendering`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Dependencies` to `App Config & Layout`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `metadata`, `viewport`, `dynamic` to the rest of the system?**
  _91 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Config & Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Route Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.1106612685560054 - nodes in this community are weakly interconnected._
- **Should `Product Concepts & Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.09982174688057041 - nodes in this community are weakly interconnected._