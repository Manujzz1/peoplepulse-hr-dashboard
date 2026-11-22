begin;

-- The limit must include staged rows that the caller's SELECT policy hides.
-- Run after row authorization and keep this function private and trigger-only.
alter function private.enforce_project_allocation_limit() security definer;
revoke all on function private.enforce_project_allocation_limit() from public, anon, authenticated, service_role;

drop trigger project_allocation_limit_trigger on public.project_allocations;
create trigger project_allocation_limit_trigger
after insert or update on public.project_allocations
for each row execute function private.enforce_project_allocation_limit();

commit;
