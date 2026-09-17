-- ===========================================================================
-- 0016 — Let an admin actually write their own audit row
--
-- 0011 gave admin_actions a SELECT-only policy, so every audit INSERT was
-- denied by RLS (42501). The effect was worse than a plain failure: the
-- verify_provider action UPDATED the provider, wrote no audit row, and
-- returned FORBIDDEN to the caller — a state change with no trail and a
-- misleading error. Spec §33 requires every admin action to be audited.
--
-- `admin_id = auth.uid()` is part of the check on purpose: an admin may
-- record their own actions and no one else's, so the trail cannot be forged
-- to implicate another administrator.
--
-- There is still no UPDATE or DELETE policy, and none should be added: the
-- audit log is append-only by design.
-- ===========================================================================

drop policy if exists admin_actions_insert_own on public.admin_actions;
create policy admin_actions_insert_own on public.admin_actions
  for insert
  with check (public.is_admin() and admin_id = auth.uid());
