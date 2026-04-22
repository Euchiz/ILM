# ILM — Next stage plan

Rewrite this file when priorities change. It always describes *the current planned next stage*, not historical stages.

---

## Stage: Membership & admin surfaces

**Why now.** `LabSettingsPanel` and `LabMembersPanel` already exist in `@ilm/ui`, but neither is reachable from a top-level surface. Owners can't promote admins without first creating a project; admins cannot invite members at all; and a signed-up user with zero memberships is stuck — there is no way to join an existing lab.

Ship this before starting `funding-manager` / `supply-manager` schemas, because those apps will inherit the same membership gaps and duplicating the fix across four apps gets expensive.

### Decisions already made

- **Discoverability**: **share-link-only**, no public lab directory. Labs are not listed anywhere. Users get in via a pasted invite/share link.
- **Lab identity**: internal UUID is the join key on the backend. The share link embeds the UUID (or a signed token). Display name is free-form and non-unique — labs can pick any name. Nothing user-facing asks people to memorize or type a lab id.
- **Approval required**: all join requests require admin-or-owner approval. Owners can still invite by email (already in the RPC layer).

### Backend (new migration)

`supabase/migrations/YYYYMMDDHHMMSS_lab_join_requests.sql`

- New table `lab_join_requests`:
  - `id uuid pk default gen_random_uuid()`
  - `lab_id uuid not null references labs(id) on delete cascade`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `message text`
  - `status text not null check (status in ('pending','approved','rejected','cancelled')) default 'pending'`
  - `created_at timestamptz default now()`
  - `reviewed_by uuid references auth.users(id)`
  - `reviewed_at timestamptz`
  - `unique(lab_id, user_id) where status = 'pending'` (one open request per user per lab)
- RLS:
  - The requester can SELECT/INSERT/UPDATE (cancel) their own pending row.
  - Lab admins + owners can SELECT all rows for their lab.
- RPCs (all `security definer`, strict check inside):
  - `request_lab_join(p_lab_id uuid, p_message text)` — creates a pending request; fails if already a member or a pending request exists.
  - `approve_lab_join(p_request_id uuid)` — admin/owner only; inserts `lab_membership` with role `member`, marks request approved, writes audit row.
  - `reject_lab_join(p_request_id uuid, p_comment text)` — admin/owner only; comment required.
  - `cancel_lab_join(p_request_id uuid)` — requester only.
  - `lookup_lab_by_token(p_token text) returns (id, name)` — validates a signed token and returns minimal lab info for the join-screen preview. (Token format TBD — simplest is HMAC of lab_id with a shared secret stored via Postgres config; fallback is just `lab_id` as the "token" since it's a UUID.)

### Frontend

1. **Top-level Lab Settings surface** (shared shell). A new route/screen accessible from a button in the top bar next to `AppSwitcher`, visible when `activeLab?.role` is `admin` or `owner`. Mounts:
   - `LabSettingsPanel` (owner-only promote/demote).
   - `LabMembersPanel` (admin+owner invite-by-email, pending invitations, remove member).
   - **New** `LabJoinRequestsPanel` — list of pending join requests with Approve / Reject (comment required) buttons.
   - **New** `LabShareLinkPanel` — "Share this link" copyable URL containing the lab's UUID or token; owner/admin only.
2. **Join-by-link screen** on the auth shell. When a signed-in user with a lab membership visits the link, offer "Open this lab" (no-op if already a member). When a signed-in user with no membership for that lab visits, show `lookup_lab_by_token` preview + a "Request to join" form with optional message. When a signed-out user visits, preserve the link through sign-in/sign-up then resume.
3. **Empty state for zero-lab users.** Replace the current "create a lab" prompt with a two-option card: "Create a new lab" or "I have an invite link" (paste the URL).
4. Remove `LabSettingsPanel` from the project Personnel tab once the top-level surface ships — Personnel keeps only `ProjectLeadsPanel` and the roster.

### Tradeoffs to weigh before implementing

- **Token format.** Raw UUID in the URL is simplest but leaks the id permanently. A signed token rotatable from Lab Settings is safer but adds ~30 lines of SQL. Recommend raw UUID for v1, rotation as a follow-up if anyone complains.
- **Self-cancel of pending request.** Nice to have. One checkbox of extra UI. Include in v1.
- **Email invite vs. share link.** Keep both — email invites are still the right fit for "I know Alice's address," share links are the right fit for "here's the Slack channel." The backend already has invite-by-email; just surface it.

---

## After this stage

- **Stage 4b (funding-manager)** — schema design + adapter + UI; reuse the auth/lab/settings shell built above.
- **Stage 4c (supply-manager)** — same treatment.
- **Deferred housekeeping**: fractional `sort_order`, layout polish (InfoTab responsive grid, roadmap card ellipsis, recycle-bin visual differentiation), dead-code simplify pass.
