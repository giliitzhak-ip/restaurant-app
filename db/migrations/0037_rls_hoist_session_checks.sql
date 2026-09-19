-- ===========================================================================
-- 0037 — evaluate the whole-session RLS checks once, not once per row
--
-- The admin control tower took 7.2 seconds to load against a 10,000-provider
-- network. The data was never the problem: the same counts run in 11ms with
-- RLS off. The policies were the problem.
--
--   count(*) from jobs, no RLS     11 ms
--   count(*) from jobs, as admin  949 ms      ← 86x
--
-- EXPLAIN says why. Every policy here is a per-row Filter:
--
--   Seq Scan on jobs (actual rows=143118)
--     Filter: (customer_id = auth.uid() OR is_admin()
--              OR provider_has_interest_in_job(id))
--
-- `is_admin()` is SECURITY DEFINER, so the planner will not inline it. It is
-- a real function call — and its own SELECT against profiles — once for each
-- of the 143,118 rows. The overview screen runs about ten such counts.
--
-- The fix is the scalar subquery. `(select is_admin())` is uncorrelated, so
-- the planner hoists it into an InitPlan and runs it ONCE per statement,
-- caching the boolean for every row. Same for `auth.uid()`. Both are STABLE
-- and take no arguments, which is exactly what makes the rewrite sound: a
-- value that cannot vary within a statement, computed once instead of N
-- times.
--
-- WHAT THIS DOES NOT TOUCH, and the distinction is the whole safety argument:
-- the row-correlated helpers. `provider_has_interest_in_job(id)`,
-- `is_job_participant(job_id)`, `can_review(job_id, subject_id, direction)`,
-- `customer_may_track_provider(provider_id)`, `job_customer_id(job_id)`,
-- `provider_assigned_to_job(id)` and `shares_active_job_with(id)` all read
-- the row being tested. Wrapping one of those in a subquery would freeze the
-- first row's answer and apply it to every other row — silently granting
-- access to everything. They stay exactly where they are, evaluated per row.
--
-- 61 of 71 policies are rewritten. No table, column, grant, role or predicate
-- changes: the boolean each policy computes is identical, only the number of
-- times it is computed differs. The 35 security tests are the proof — they
-- exercise cross-tenant reads, payout privacy, role escalation, audit forgery
-- and review eligibility against these exact policies.
--
-- D-014's rule applies to the check at the bottom: this migration asserts its
-- own outcome rather than trusting that 61 ALTERs all landed.
-- ===========================================================================

alter policy admin_actions_admin on admin_actions
  using ((select is_admin()));
alter policy admin_actions_insert_own on admin_actions
  with check (((select is_admin()) AND (admin_id = (select auth.uid()))));
alter policy categories_admin_write on categories
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy customer_profiles_rw on customer_profiles
  using (((id = (select auth.uid())) OR (select is_admin()) OR shares_active_job_with(id)));
alter policy customer_profiles_update_own on customer_profiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));
alter policy disputes_admin_update on disputes
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy disputes_insert_participant on disputes
  with check (((opened_by = (select auth.uid())) AND is_job_participant(job_id)));
alter policy disputes_participant on disputes
  using ((is_job_participant(job_id) OR (select is_admin())));
alter policy job_assignments_select_scoped on job_assignments
  using (((provider_id = (select auth.uid())) OR (select is_admin()) OR (job_customer_id(job_id) = (select auth.uid()))));
alter policy job_assignments_update_own on job_assignments
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy job_image_blobs_insert on job_image_blobs
  with check ((EXISTS ( SELECT 1 FROM job_images i WHERE ((i.id = job_image_blobs.image_id) AND (i.uploaded_by = (select auth.uid())) AND is_job_participant(i.job_id)))));
alter policy job_image_blobs_read on job_image_blobs
  using ((EXISTS ( SELECT 1 FROM job_images i WHERE ((i.id = job_image_blobs.image_id) AND (is_job_participant(i.job_id) OR (select is_admin()))))));
alter policy job_images_delete_own on job_images
  using (((uploaded_by = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM jobs j WHERE ((j.id = job_images.job_id) AND (j.status <> ALL (ARRAY['COMPLETED'::job_status, 'PAID'::job_status, 'REVIEWED'::job_status, 'CANCELLED_BY_CUSTOMER'::job_status, 'CANCELLED_BY_PROVIDER'::job_status, 'CANCELLED_BY_SYSTEM'::job_status])))))));
alter policy job_images_insert_participant on job_images
  with check (((uploaded_by = (select auth.uid())) AND is_job_participant(job_id)));
alter policy job_images_participant on job_images
  using ((is_job_participant(job_id) OR (select is_admin())));
alter policy job_offers_select_scoped on job_offers
  using (((provider_id = (select auth.uid())) OR (select is_admin()) OR (job_customer_id(job_id) = (select auth.uid()))));
alter policy job_offers_update_own on job_offers
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy job_status_history_select on job_status_history
  using ((is_job_participant(job_id) OR (select is_admin())));
alter policy jobs_insert_own on jobs
  with check ((customer_id = (select auth.uid())));
alter policy jobs_select_participant on jobs
  using (((customer_id = (select auth.uid())) OR (select is_admin()) OR provider_has_interest_in_job(id)));
alter policy jobs_update_participant on jobs
  using (((customer_id = (select auth.uid())) OR (select is_admin()) OR provider_assigned_to_job(id)))
  with check (((customer_id = (select auth.uid())) OR (select is_admin()) OR provider_assigned_to_job(id)));
alter policy matching_events_admin on matching_events
  using ((select is_admin()));
alter policy messages_insert_participant on messages
  with check (((sender_id = (select auth.uid())) AND is_job_participant(job_id)));
alter policy messages_participant on messages
  using ((is_job_participant(job_id) OR (select is_admin())));
alter policy notification_deliveries_own on notification_deliveries
  using (((user_id = (select auth.uid())) OR (select is_admin())));
alter policy notifications_own on notifications
  using (((user_id = (select auth.uid())) OR (select is_admin())));
alter policy notifications_update_own on notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));
alter policy payment_transactions_admin on payment_transactions
  using ((select is_admin()));
alter policy payments_select_parties on payments
  using (((customer_id = (select auth.uid())) OR (provider_id = (select auth.uid())) OR (select is_admin())));
alter policy platform_fees_admin on platform_fees
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy profiles_select_own on profiles
  using (((id = (select auth.uid())) OR (select is_admin()) OR shares_active_job_with(id)));
alter policy profiles_update_own on profiles
  using (((id = (select auth.uid())) OR (select is_admin())))
  with check (((id = (select auth.uid())) OR (select is_admin())));
alter policy provider_admin_notes_admin_only on provider_admin_notes
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy provider_availability_overrides_own on provider_availability_overrides
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_availability_rules_own on provider_availability_rules
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_categories_own_write on provider_categories
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_document_blobs_insert_own on provider_document_blobs
  with check ((EXISTS ( SELECT 1 FROM provider_documents d WHERE ((d.id = provider_document_blobs.document_id) AND (d.provider_id = (select auth.uid()))))));
alter policy provider_document_blobs_read on provider_document_blobs
  using ((EXISTS ( SELECT 1 FROM provider_documents d WHERE ((d.id = provider_document_blobs.document_id) AND ((d.provider_id = (select auth.uid())) OR (select is_admin()))))));
alter policy provider_documents_admin_update on provider_documents
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy provider_documents_delete_own_pending on provider_documents
  using (((provider_id = (select auth.uid())) AND (status = 'PENDING'::verification_status)));
alter policy provider_documents_insert_own on provider_documents
  with check ((provider_id = (select auth.uid())));
alter policy provider_documents_own on provider_documents
  using (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_location_history_insert_own on provider_location_history
  with check ((provider_id = (select auth.uid())));
alter policy provider_location_history_own on provider_location_history
  using (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_locations_customer_tracking on provider_locations
  using (((select is_admin()) OR customer_may_track_provider(provider_id)));
alter policy provider_locations_own on provider_locations
  using ((provider_id = (select auth.uid())))
  with check ((provider_id = (select auth.uid())));
alter policy provider_payout_own on provider_payout_details
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_profiles_select on provider_profiles
  using (((id = (select auth.uid())) OR (select is_admin()) OR (verification = 'VERIFIED'::verification_status)));
alter policy provider_profiles_update_own on provider_profiles
  using (((id = (select auth.uid())) OR (select is_admin())))
  with check (((id = (select auth.uid())) OR (select is_admin())));
alter policy provider_services_own_write on provider_services
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_availability_own on provider_status_history
  using (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy provider_status_history_own on provider_status_history
  using (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy reviews_insert_participant on reviews
  with check (((author_id = (select auth.uid())) AND can_review(job_id, subject_id, direction)));
alter policy service_areas_own_write on service_areas
  using (((provider_id = (select auth.uid())) OR (select is_admin())))
  with check (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy services_admin_write on services
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy settings_admin on settings
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy trade_proposals_admin_update on trade_proposals
  using ((select is_admin()))
  with check ((select is_admin()));
alter policy trade_proposals_own_insert on trade_proposals
  with check (((provider_id = (select auth.uid())) AND (status = 'PENDING'::proposal_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (resolved_service_id IS NULL)));
alter policy trade_proposals_own_read on trade_proposals
  using (((provider_id = (select auth.uid())) OR (select is_admin())));
alter policy trade_proposals_own_withdraw on trade_proposals
  using ((((provider_id = (select auth.uid())) AND (status = 'PENDING'::proposal_status)) OR (select is_admin())));
alter policy user_sessions_own on user_sessions
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

-- ── Prove it landed ────────────────────────────────────────────────────────
-- A rewrite that silently skipped a policy would leave that table slow and
-- nobody would look again. Fail the migration instead.
--
-- The comparison is against the DEPARSED form, because that is the only
-- thing pg_get_expr will give back: PostgreSQL re-prints a hoisted call as
-- `( SELECT is_admin() AS is_admin)`. Stripping that exact string and then
-- looking for a bare `is_admin()` finds a policy the rewrite missed, and
-- nothing else. (The first version of this check used a lowercase lookbehind
-- and reported all 61 rewritten policies as failures — the assertion was
-- wrong, not the rewrite. Worth leaving on the record: a check that cannot
-- distinguish success from failure is not a check.)
do $$
declare
  stragglers text;
begin
  select string_agg(polrelid::regclass::text || '.' || polname, ', ')
    into stragglers
    from pg_policy
   where replace(coalesce(pg_get_expr(polqual, polrelid), ''),
                 '( SELECT is_admin() AS is_admin)', '') like '%is_admin()%'
      or replace(coalesce(pg_get_expr(polwithcheck, polrelid), ''),
                 '( SELECT is_admin() AS is_admin)', '') like '%is_admin()%';

  if stragglers is not null then
    raise exception 'RLS_HOIST_INCOMPLETE: is_admin() still evaluated per row in %', stragglers;
  end if;
end $$;
