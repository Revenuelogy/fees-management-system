-- =============================================================================
-- Optional least-privilege database role for the app
--
-- The simplest setup connects the app as the schema owner. For defence in
-- depth, connect it as a separate role instead; row level security and the
-- function privileges below then apply to every query the app makes:
--
--   create role fees_app login password '...';
--   select public.grant_app_access('fees_app');   -- run as the schema owner
--
-- Re-run grant_app_access after applying new migrations.
-- =============================================================================

create function public.grant_app_access(p_role name) returns void
language plpgsql set search_path = public as $$
begin
  execute format('grant usage on schema public, extensions to %I', p_role);
  execute format('grant select, insert, update, delete on all tables in schema public to %I', p_role);
  execute format('grant usage, select on all sequences in schema public to %I', p_role);
  execute format('grant execute on all functions in schema public to %I', p_role);

  -- bookkeeping and internal helpers stay with the owner
  if to_regclass('public.schema_migrations') is not null then
    execute format('revoke all on table public.schema_migrations from %I', p_role);
  end if;
  execute format('revoke execute on function public.next_receipt_no(uuid), public.reallocate_student(uuid), '
                 'public.reallocate_all(), public.month_target_charges(date, boolean, boolean), '
                 'public.set_skip_realloc(boolean), public.profiles_keep_one_admin(), '
                 'public.grant_app_access(name) from %I', p_role);
end $$;

revoke execute on function public.grant_app_access(name) from public;
