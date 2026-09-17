-- ===========================================================================
-- 0027 — A resolved proposal must outlive the reviewer's account
--
-- 0025 paired `reviewed_by ... on delete set null` with a check constraint
-- requiring a resolved row to have BOTH reviewed_by and reviewed_at. Those
-- two rules contradict each other: deleting the admin who reviewed a
-- proposal nulls reviewed_by, the row then violates its own constraint, and
-- the DELETE fails. So an admin account could not be removed once they had
-- reviewed anything — and the failure surfaced as an unrelated cleanup error
-- rather than as anything a reader would connect to proposals.
--
-- The invariant worth keeping is that a resolved row records WHEN it was
-- resolved. WHO resolved it is the audit trail's job: admin_actions carries
-- the actor with its own retention rules, and that is the record of
-- authority. reviewed_by stays as a convenience for the queue UI and may
-- legitimately become null when an account is deleted.
-- ===========================================================================

alter table public.trade_proposals
  drop constraint if exists trade_proposals_resolution_complete;

alter table public.trade_proposals
  add constraint trade_proposals_resolution_complete check (
    (status = 'PENDING' and reviewed_at is null)
    or (status <> 'PENDING' and reviewed_at is not null)
  );

comment on column public.trade_proposals.reviewed_by is
  'The reviewing admin, where the account still exists. admin_actions is the authoritative record of who decided — see migration 0027.';
