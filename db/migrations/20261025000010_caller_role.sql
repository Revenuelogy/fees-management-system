-- =============================================================================
-- Caller: a login that only phones families and records the calls (see the next migration for what it may
-- do). A new enum value cannot be used in the transaction that adds it, so it gets a migration of its own.
-- =============================================================================
alter type public.app_role add value if not exists 'caller';
