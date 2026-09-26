export type Tree = {
  id: string;
  name: string;
  owner_id: string;
  share_token: string;
  created_at: string;
};

export type Person = {
  id: string;
  tree_id: string;
  user_id: string | null; // null = unclaimed placeholder
  full_name: string;
  chinese_name: string | null;
  birth_date: string | null;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  // Manual sort position within its generation group in the list view; null
  // means "unordered" and falls back to alphabetical.
  list_order: number | null;
  // Dropped onto the tree canvas but not yet connected to anyone — rendered
  // freeform at (position_x, position_y) instead of sitting in the drawer.
  placed: boolean;
  position_x: number | null;
  position_y: number | null;
  created_by: string;
  created_at: string;
};

export type RelationType = "parent" | "spouse";

// A 'parent' edge means related_person_id is a parent of person_id.
// A 'spouse' edge links two partners (stored once, treated as symmetric).
export type Relationship = {
  id: string;
  tree_id: string;
  person_id: string;
  related_person_id: string;
  type: RelationType;
  created_by: string;
};

// A list-view branch: two people from one generation, opened as a place to
// add their children. Owner-only.
export type Branch = {
  id: string;
  tree_id: string;
  parent_a_id: string;
  parent_b_id: string;
  created_by: string;
  created_at: string;
};

export type Notification = {
  id: string;
  tree_id: string;
  recipient_id: string;
  message: string;
  read: boolean;
  created_at: string;
};

// Relation chosen in PositionPicker: how the joiner relates to an anchor person.
export type JoinRelation = "child" | "spouse" | "parent";

// Per-account settings, independent of any tree membership.
export type Profile = {
  id: string;
  avatar_url: string | null;
  created_at: string;
};
