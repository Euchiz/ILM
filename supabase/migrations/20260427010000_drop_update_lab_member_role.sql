-- Drop update_lab_member_role in favor of the owner-only promote/demote RPCs.
--
-- The older `update_lab_member_role` allowed any admin to change another
-- member's admin/member role, which contradicts the invariant that only the
-- sole lab owner may promote members to admin or demote admins back to
-- member (see promote_member_to_admin / demote_admin_to_member in the
-- 20260425000000 hardening migration).

drop function if exists public.update_lab_member_role(uuid, uuid, text);
