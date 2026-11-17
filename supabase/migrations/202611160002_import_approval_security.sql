begin;

-- Organisation and role administration is reserved for Super Admins. HR Admins
-- can prepare and review imports, but cannot grant themselves broader access.
delete from public.role_permissions
where role_key = 'hr_admin'
  and permission_key in ('org.manage', 'users.manage', 'imports.publish');

insert into public.role_permissions (role_key, permission_key) values
  ('hr_admin', 'imports.review'),
  ('hr_admin', 'imports.approve')
on conflict do nothing;

create or replace function private.is_organization_super_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.organization_id = target_organization_id
      and ur.company_id is null
      and ur.department_id is null
      and ur.active
      and ur.role_key = 'super_admin'
  );
$$;

revoke all on function private.is_organization_super_admin(uuid) from public, anon;
grant execute on function private.is_organization_super_admin(uuid) to authenticated;

drop policy if exists user_roles_manage on public.user_roles;
create policy user_roles_manage on public.user_roles for all to authenticated
  using (private.is_organization_super_admin(organization_id))
  with check (private.is_organization_super_admin(organization_id));

alter table public.import_batches
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz;

create or replace function private.enforce_import_batch_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  required_permission text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Draft' or new.uploaded_by is not null or new.reviewed_by is not null
      or new.reviewed_at is not null or new.approved_by is not null or new.approved_at is not null
      or new.published_at is not null then
      raise exception 'Import batches must begin in Draft with no workflow actors.' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status in ('Published', 'Rejected') then
    raise exception 'Published or rejected import batches are immutable.' using errcode = '23514';
  end if;

  if new.company_id <> old.company_id or new.dataset_type <> old.dataset_type
    or new.reporting_month is distinct from old.reporting_month
    or (new.uploaded_by is distinct from old.uploaded_by and not (old.status = 'Draft' and new.status = 'Uploaded'))
    or new.uploaded_at is distinct from old.uploaded_at
    or new.replaces_batch_id is distinct from old.replaces_batch_id then
    raise exception 'Import batch identity fields cannot be changed.' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    required_permission := case
      when old.status = 'Draft' and new.status = 'Uploaded' then 'imports.write'
      when old.status = 'Uploaded' and new.status = 'Validated' then 'imports.write'
      when old.status = 'Validated' and new.status = 'Reviewed' then 'imports.review'
      when old.status = 'Reviewed' and new.status = 'Approved' then 'imports.approve'
      when old.status = 'Approved' and new.status = 'Published' then 'imports.publish'
      when old.status in ('Uploaded', 'Validated', 'Reviewed') and new.status = 'Rejected' then 'imports.review'
      else null
    end;

    if required_permission is null
      or not private.has_company_permission(new.company_id, required_permission, new.department_id) then
      raise exception 'Import batch transition is not permitted.' using errcode = '42501';
    end if;
    if actor_id is null then
      raise exception 'An authenticated actor is required for import workflow changes.' using errcode = '42501';
    end if;

    if old.status = 'Draft' and new.status = 'Uploaded' then
      if new.uploaded_by is not null and new.uploaded_by <> actor_id then
        raise exception 'Uploader must match the authenticated actor.' using errcode = '42501';
      end if;
      new.uploaded_by := actor_id;
    elsif old.status = 'Validated' and new.status = 'Reviewed' then
      if actor_id = old.uploaded_by then
        raise exception 'The uploader cannot review their own import.' using errcode = '42501';
      end if;
      new.reviewed_by := actor_id;
      new.reviewed_at := pg_catalog.now();
    elsif old.status = 'Reviewed' and new.status = 'Approved' then
      if actor_id = old.uploaded_by or actor_id = old.reviewed_by then
        raise exception 'Approval must be performed by a different user than upload and review.' using errcode = '42501';
      end if;
      new.approved_by := actor_id;
      new.approved_at := pg_catalog.now();
    elsif old.status = 'Approved' and new.status = 'Published' then
      new.published_at := pg_catalog.now();
    elsif new.status = 'Rejected' then
      new.reviewed_by := coalesce(old.reviewed_by, actor_id);
      new.reviewed_at := coalesce(old.reviewed_at, pg_catalog.now());
    end if;
  else
    if new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.published_at is distinct from old.published_at then
      raise exception 'Import workflow actor fields are managed by the workflow.' using errcode = '23514';
    end if;
  end if;

  if old.status not in ('Draft', 'Uploaded') and (
    new.total_rows is distinct from old.total_rows
    or new.accepted_rows is distinct from old.accepted_rows
    or new.rejected_rows is distinct from old.rejected_rows
    or new.warning_count is distinct from old.warning_count
    or new.metadata is distinct from old.metadata
  ) then
    raise exception 'Validated import details are frozen after review begins.' using errcode = '23514';
  end if;

  if new.total_rows <> new.accepted_rows + new.rejected_rows then
    raise exception 'Import row counts must reconcile to the total row count.' using errcode = '23514';
  end if;

  insert into public.audit_logs (company_id, department_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id, new.department_id, actor_id, 'import_status_' || pg_catalog.lower(new.status),
    'import_batch', new.id::text,
    pg_catalog.jsonb_build_object('from', old.status, 'to', new.status, 'datasetType', new.dataset_type, 'reportingMonth', new.reporting_month)
  );
  return new;
end;
$$;

revoke all on function private.enforce_import_batch_workflow() from public, anon, authenticated;
create trigger import_batch_workflow_trigger
before insert or update on public.import_batches
for each row execute function private.enforce_import_batch_workflow();

commit;
