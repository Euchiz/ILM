export type MembershipRole = "owner" | "admin" | "member";

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  headshot_url: string | null;
};

export type Lab = {
  id: string;
  name: string;
  slug: string | null;
  created_by: string | null;
};

export type LabMembership = {
  lab_id: string;
  user_id: string;
  role: MembershipRole;
};

export type LabWithRole = Lab & { role: MembershipRole };
