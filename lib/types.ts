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
  birth_date: string | null;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
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
