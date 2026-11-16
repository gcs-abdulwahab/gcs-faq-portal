-- Super admin dashboard: roles, FAQ activity log, and view tracking.
-- Run this AFTER schema.sql. Safe to run more than once.

-- 1. Roles for editors ------------------------------------------------------
alter table public.faq_editors
  add column if not exists role text not null default 'editor';

alter table public.faq_editors drop constraint if exists faq_editors_role_check;
alter table public.faq_editors
  add constraint faq_editors_role_check check (role in ('editor', 'super_admin'));

update public.faq_editors set role = 'super_admin' where email = 'admin@gcslahore.edu.pk';

-- True when the signed-in user is a super admin. SECURITY DEFINER so it can read
-- faq_editors regardless of that table's row-level security.
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.faq_editors
    where email = auth.jwt() ->> 'email' and role = 'super_admin'
  );
$$;

-- 2. Activity log (written by a trigger, so it cannot be skipped from the browser)
create table if not exists public.faq_audit_log (
  id bigint generated always as identity primary key,
  faq_id uuid,
  faq_code text,
  action text not null check (action in ('created', 'updated', 'deleted')),
  actor_email text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists faq_audit_log_created_at_idx on public.faq_audit_log (created_at desc);

alter table public.faq_audit_log enable row level security;
drop policy if exists "Super admin reads audit log" on public.faq_audit_log;
create policy "Super admin reads audit log"
  on public.faq_audit_log for select
  using (public.is_super_admin());

create or replace function public.log_faq_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor text := coalesce(auth.jwt() ->> 'email', 'system (SQL / dashboard)');
begin
  if tg_op = 'INSERT' then
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, new_data)
    values (new.id, new.faq_code, 'created', actor, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, old_data, new_data)
    values (new.id, new.faq_code, 'updated', actor, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, old_data)
    values (old.id, old.faq_code, 'deleted', actor, to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists faq_audit on public.faqs;
create trigger faq_audit
  after insert or update or delete on public.faqs
  for each row execute function public.log_faq_change();

-- 3. View tracking -----------------------------------------------------------
-- faq_id is null for a visit to the portal; otherwise it is the FAQ that was opened.
create table if not exists public.faq_views (
  id bigint generated always as identity primary key,
  faq_id uuid references public.faqs (id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists faq_views_faq_id_idx on public.faq_views (faq_id);
create index if not exists faq_views_viewed_at_idx on public.faq_views (viewed_at);

-- No policies: nobody can read or write this table directly.
alter table public.faq_views enable row level security;

-- Visitors record views only through this function.
create or replace function public.record_view(p_faq_id uuid default null)
returns void
language sql security definer set search_path = public
as $$
  insert into public.faq_views (faq_id)
  select p_faq_id
  where p_faq_id is null or exists (select 1 from public.faqs where id = p_faq_id);
$$;
revoke all on function public.record_view(uuid) from public;
grant execute on function public.record_view(uuid) to anon, authenticated;

-- Per-FAQ view counts (super admin only).
create or replace function public.admin_faq_view_stats()
returns table (
  faq_id uuid, faq_code text, category text, question text,
  views bigint, views_7d bigint, last_viewed timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select f.id, f.faq_code, f.category, f.question,
           count(v.id),
           count(v.id) filter (where v.viewed_at > now() - interval '7 days'),
           max(v.viewed_at)
    from public.faqs f
    left join public.faq_views v on v.faq_id = f.id
    group by f.id
    order by count(v.id) desc, f.faq_code;
end;
$$;

-- Overall totals (super admin only).
create or replace function public.admin_view_totals()
returns table (page_visits bigint, page_visits_7d bigint, faq_opens bigint, faq_opens_7d bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select count(*) filter (where faq_id is null),
           count(*) filter (where faq_id is null and viewed_at > now() - interval '7 days'),
           count(*) filter (where faq_id is not null),
           count(*) filter (where faq_id is not null and viewed_at > now() - interval '7 days')
    from public.faq_views;
end;
$$;

revoke all on function public.admin_faq_view_stats() from public, anon;
revoke all on function public.admin_view_totals() from public, anon;
grant execute on function public.admin_faq_view_stats() to authenticated;
grant execute on function public.admin_view_totals() to authenticated;

-- 4. Public popularity stars ---------------------------------------------------
-- Returns only a 0-5 star rating per FAQ (relative to the most-opened FAQ), never raw counts.
create or replace function public.faq_star_ratings()
returns table (faq_id uuid, stars int)
language sql stable security definer set search_path = public
as $$
  with counts as (
    select f.id, count(v.id) as n
    from public.faqs f
    left join public.faq_views v on v.faq_id = f.id
    group by f.id
  ), top as (
    select greatest(max(n), 1) as m from counts
  )
  select c.id,
         case when c.n = 0 then 0
              else greatest(1, ceil(5.0 * c.n / top.m))::int
         end
  from counts c cross join top;
$$;
revoke all on function public.faq_star_ratings() from public;
grant execute on function public.faq_star_ratings() to anon, authenticated;

-- 5. Manual ordering (super admin drag and drop) ------------------------------------
alter table public.faqs add column if not exists sort_order int;

-- Give existing FAQs an initial order by code.
update public.faqs f set sort_order = o.rn
from (select id, row_number() over (order by faq_code) as rn from public.faqs) o
where f.id = o.id and f.sort_order is null;

-- New FAQs go to the end; only a super admin may change the order.
create or replace function public.faq_sort_order_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.faqs;
    end if;
  elsif new.sort_order is distinct from old.sort_order
        and auth.jwt() is not null and not public.is_super_admin() then
    raise exception 'Only the super admin can reorder FAQs' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists faq_sort_order_guard on public.faqs;
create trigger faq_sort_order_guard
  before insert or update on public.faqs
  for each row execute function public.faq_sort_order_guard();

-- Allow a 'reordered' entry in the activity log.
alter table public.faq_audit_log drop constraint if exists faq_audit_log_action_check;
alter table public.faq_audit_log
  add constraint faq_audit_log_action_check check (action in ('created', 'updated', 'deleted', 'reordered'));

-- Don't log an edit when only the position changed (the reorder is logged once instead).
create or replace function public.log_faq_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor text := coalesce(auth.jwt() ->> 'email', 'system (SQL / dashboard)');
begin
  if tg_op = 'INSERT' then
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, new_data)
    values (new.id, new.faq_code, 'created', actor, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'sort_order') = (to_jsonb(new) - 'sort_order') then
      return new;
    end if;
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, old_data, new_data)
    values (new.id, new.faq_code, 'updated', actor, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.faq_audit_log (faq_id, faq_code, action, actor_email, old_data)
    values (old.id, old.faq_code, 'deleted', actor, to_jsonb(old));
    return old;
  end if;
end;
$$;

-- Saves a full new order in one call (super admin only) and logs it once.
create or replace function public.reorder_faqs(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  before_codes text[];
  after_codes text[];
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select array_agg(faq_code order by sort_order, faq_code) into before_codes from public.faqs;

  update public.faqs f set sort_order = o.pos
  from unnest(p_ids) with ordinality as o(id, pos)
  where f.id = o.id and f.sort_order is distinct from o.pos;

  select array_agg(faq_code order by sort_order, faq_code) into after_codes from public.faqs;

  if before_codes is distinct from after_codes then
    insert into public.faq_audit_log (action, actor_email, old_data, new_data)
    values ('reordered', auth.jwt() ->> 'email',
            jsonb_build_object('order', before_codes),
            jsonb_build_object('order', after_codes));
  end if;
end;
$$;
revoke all on function public.reorder_faqs(uuid[]) from public, anon;
grant execute on function public.reorder_faqs(uuid[]) to authenticated;

-- 6. Visitor question submissions (review queue) --------------------------------
create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.faq_editors where email = auth.jwt() ->> 'email');
$$;

create table if not exists public.faq_submissions (
  id uuid default gen_random_uuid() primary key,
  question text not null,
  category text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  faq_id uuid references public.faqs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists faq_submissions_status_idx on public.faq_submissions (status, created_at desc);

-- Editors can read the queue. Nobody writes to it directly; the functions below do.
alter table public.faq_submissions enable row level security;
drop policy if exists "Editors read submissions" on public.faq_submissions;
create policy "Editors read submissions"
  on public.faq_submissions for select
  using (public.is_editor());

-- Anyone (including anonymous visitors) can submit a question.
-- (Replaced in section 7 by a version that returns the submission id.)
drop function if exists public.submit_question(text, text);
create function public.submit_question(p_question text, p_category text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  q text := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  c text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if char_length(q) < 10 then
    raise exception 'Please write a full question (at least 10 characters).' using errcode = '22023';
  end if;
  if char_length(q) > 500 then
    raise exception 'Please keep your question under 500 characters.' using errcode = '22023';
  end if;
  if c is not null and char_length(c) > 100 then
    c := left(c, 100);
  end if;
  -- Ignore exact duplicates that are already waiting for review.
  if exists (select 1 from public.faq_submissions where status = 'pending' and lower(question) = lower(q)) then
    return;
  end if;
  -- Basic flood protection.
  if (select count(*) from public.faq_submissions where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many questions are being submitted right now. Please try again in a minute.' using errcode = '54000';
  end if;
  insert into public.faq_submissions (question, category) values (q, c);
end;
$$;
revoke all on function public.submit_question(text, text) from public;
grant execute on function public.submit_question(text, text) to anon, authenticated;

-- Approve: publish as a new FAQ with the editor's answer (logged as 'created' by the audit trigger).
create or replace function public.approve_submission(
  p_id uuid, p_faq_code text, p_category text, p_question text, p_answer text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_editor() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.faq_submissions where id = p_id and status = 'pending') then
    raise exception 'This question has already been reviewed.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_faq_code), '') = '' or coalesce(btrim(p_category), '') = ''
     or coalesce(btrim(p_question), '') = '' or coalesce(btrim(p_answer), '') = '' then
    raise exception 'Code, category, question and answer are all required.' using errcode = '22023';
  end if;

  insert into public.faqs (faq_code, category, question, answer)
  values (upper(btrim(p_faq_code)), btrim(p_category), btrim(p_question), btrim(p_answer))
  returning id into new_id;

  update public.faq_submissions
  set status = 'approved', faq_id = new_id, reviewed_by = auth.jwt() ->> 'email', reviewed_at = now()
  where id = p_id;

  return new_id;
end;
$$;

create or replace function public.reject_submission(p_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_editor() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.faq_submissions
  set status = 'rejected', review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = auth.jwt() ->> 'email', reviewed_at = now()
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'This question has already been reviewed.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.approve_submission(uuid, text, text, text, text) from public, anon;
revoke all on function public.reject_submission(uuid, text) from public, anon;
grant execute on function public.approve_submission(uuid, text, text, text, text) to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;

-- 7. Refer a submission to an existing FAQ, and let visitors track their questions ------
alter table public.faq_submissions drop constraint if exists faq_submissions_status_check;
alter table public.faq_submissions
  add constraint faq_submissions_status_check check (status in ('pending', 'approved', 'referred', 'rejected'));

-- submit_question now returns the submission id so the visitor's browser can track it.
drop function if exists public.submit_question(text, text);
create function public.submit_question(p_question text, p_category text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  q text := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  c text := nullif(btrim(coalesce(p_category, '')), '');
  existing uuid;
  new_id uuid;
begin
  if char_length(q) < 10 then
    raise exception 'Please write a full question (at least 10 characters).' using errcode = '22023';
  end if;
  if char_length(q) > 500 then
    raise exception 'Please keep your question under 500 characters.' using errcode = '22023';
  end if;
  if c is not null and char_length(c) > 100 then
    c := left(c, 100);
  end if;
  -- Same question already waiting: return that one instead of creating a duplicate.
  select id into existing from public.faq_submissions
  where status = 'pending' and lower(question) = lower(q) limit 1;
  if existing is not null then
    return existing;
  end if;
  if (select count(*) from public.faq_submissions where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many questions are being submitted right now. Please try again in a minute.' using errcode = '54000';
  end if;
  insert into public.faq_submissions (question, category) values (q, c) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_question(text, text) from public;
grant execute on function public.submit_question(text, text) to anon, authenticated;

-- Respond by pointing the visitor to an FAQ that already answers the question.
create or replace function public.refer_submission(p_id uuid, p_faq_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_editor() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.faqs where id = p_faq_id) then
    raise exception 'That FAQ no longer exists.' using errcode = '22023';
  end if;
  update public.faq_submissions
  set status = 'referred', faq_id = p_faq_id, review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = auth.jwt() ->> 'email', reviewed_at = now()
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'This question has already been reviewed.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.refer_submission(uuid, uuid, text) from public, anon;
grant execute on function public.refer_submission(uuid, uuid, text) to authenticated;

-- Visitors look up their own submissions by id (ids are random and only known to the submitter).
-- Never returns staff notes or reviewer emails.
create or replace function public.get_submission_status(p_ids uuid[])
returns table (
  id uuid, question text, status text, created_at timestamptz, reviewed_at timestamptz,
  faq_id uuid, faq_code text, faq_question text, faq_answer text
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.question, s.status, s.created_at, s.reviewed_at,
         f.id, f.faq_code, f.question, f.answer
  from public.faq_submissions s
  left join public.faqs f on f.id = s.faq_id and s.status in ('approved', 'referred')
  where s.id = any (p_ids[1:50])
  order by s.created_at desc;
$$;
revoke all on function public.get_submission_status(uuid[]) from public;
grant execute on function public.get_submission_status(uuid[]) to anon, authenticated;

-- 8. FAQ info for the super admin: who added / last edited it, and when ------------
create or replace function public.admin_faq_info(p_faq_id uuid)
returns table (
  created_by text, created_at timestamptz,
  last_edited_by text, last_edited_at timestamptz, edit_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select
      (select l.actor_email from public.faq_audit_log l
        where l.faq_id = p_faq_id and l.action = 'created' order by l.created_at limit 1),
      (select l.created_at from public.faq_audit_log l
        where l.faq_id = p_faq_id and l.action = 'created' order by l.created_at limit 1),
      (select l.actor_email from public.faq_audit_log l
        where l.faq_id = p_faq_id and l.action = 'updated' order by l.created_at desc limit 1),
      (select l.created_at from public.faq_audit_log l
        where l.faq_id = p_faq_id and l.action = 'updated' order by l.created_at desc limit 1),
      (select count(*) from public.faq_audit_log l
        where l.faq_id = p_faq_id and l.action = 'updated');
end;
$$;
revoke all on function public.admin_faq_info(uuid) from public, anon;
grant execute on function public.admin_faq_info(uuid) to authenticated;

-- 9. Image uploads for rich-text answers ------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faq-images', 'faq-images', true, 512000,array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Editors upload FAQ images" on storage.objects;
create policy "Editors upload FAQ images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'faq-images' and public.is_editor());

drop policy if exists "Editors delete FAQ images" on storage.objects;
create policy "Editors delete FAQ images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'faq-images' and public.is_editor());

-- 10. Staff account management (super admin) ---------------------------------------
-- Lets the super admin add staff logins and reset passwords from the dashboard.
-- Writes Supabase auth rows the same way the dashboard's "Add user" does (bcrypt
-- password, email pre-confirmed), so the app needs no service-role key.

create or replace function public.admin_list_users()
returns table (email text, role text, has_login boolean, last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can view staff accounts.';
  end if;
  return query
    select e.email, e.role, u.id is not null, u.last_sign_in_at, u.created_at
    from public.faq_editors e
    left join auth.users u on lower(u.email) = lower(e.email)
    order by (e.role = 'super_admin') desc, e.email;
end;
$$;

create or replace function public.admin_set_password(p_email text, p_password text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can change passwords.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  if not exists (select 1 from public.faq_editors where lower(email) = v_email) then
    raise exception '% is not a staff account.', v_email;
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is null then
    -- Listed as staff but never had a login: create it now.
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '', '', '', '',
      '{"provider": "email", "providers": ["email"]}'::jsonb, '{"email_verified": true}'::jsonb, now(), now()
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );
    return;
  end if;

  update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = v_uid;

  -- Sign that person out of other devices so the old password stops working
  -- (skipped for the admin's own account so they stay logged in).
  if v_email <> lower(auth.jwt() ->> 'email') then
    delete from auth.sessions where user_id = v_uid;
  end if;
end;
$$;

create or replace function public.admin_create_user(p_email text, p_password text, p_role text default 'editor')
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can add staff accounts.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  if p_role not in ('editor', 'super_admin') then
    raise exception 'Role must be editor or super_admin.';
  end if;
  if exists (select 1 from public.faq_editors where lower(email) = v_email) then
    raise exception '% is already a staff account. Use "Change password" instead.', v_email;
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'A login for % already exists in Supabase Auth.', v_email;
  end if;

  insert into public.faq_editors (email, role) values (v_email, p_role);
  perform public.admin_set_password(v_email, p_password); -- creates the login
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_password(text, text) from public, anon;
revoke all on function public.admin_create_user(text, text, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_password(text, text) to authenticated;
grant execute on function public.admin_create_user(text, text, text) to authenticated;

-- 11. Per-staff permissions: add / edit / delete FAQs and view the dashboard ----------
-- Super admins always have every permission. Existing staff keep full access (defaults true).
alter table public.faq_editors
  add column if not exists can_add boolean not null default true,
  add column if not exists can_edit boolean not null default true,
  add column if not exists can_delete boolean not null default true,
  add column if not exists can_view_dashboard boolean not null default true;

-- p_permission: 'add' | 'edit' | 'delete' | 'dashboard'
create or replace function public.has_staff_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when e.role = 'super_admin' then true
      when p_permission = 'add' then e.can_add
      when p_permission = 'edit' then e.can_edit
      when p_permission = 'delete' then e.can_delete
      when p_permission = 'dashboard' then e.can_view_dashboard
      else false
    end
    from public.faq_editors e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
  ), false);
$$;
revoke all on function public.has_staff_permission(text) from public, anon;
grant execute on function public.has_staff_permission(text) to authenticated;

-- Enforced on the table itself, so it covers the editor form, approving a visitor's
-- question, and any direct API call. SQL editor / service-role changes (no JWT) are allowed.
create or replace function public.faq_permission_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.jwt() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and not public.has_staff_permission('add') then
    raise exception 'You do not have permission to add FAQs.' using errcode = '42501';
  elsif tg_op = 'UPDATE' and not public.has_staff_permission('edit')
        and (to_jsonb(new) - 'sort_order' - 'updated_at') is distinct from (to_jsonb(old) - 'sort_order' - 'updated_at') then
    raise exception 'You do not have permission to edit FAQs.' using errcode = '42501';
  elsif tg_op = 'DELETE' and not public.has_staff_permission('delete') then
    raise exception 'You do not have permission to delete FAQs.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists faq_permission_guard on public.faqs;
create trigger faq_permission_guard
  before insert or update or delete on public.faqs
  for each row execute function public.faq_permission_guard();

-- Dashboard: any staff member with the 'dashboard' permission (was super admin only).
drop policy if exists "Super admin reads audit log" on public.faq_audit_log;
drop policy if exists "Staff with dashboard access read audit log" on public.faq_audit_log;
create policy "Staff with dashboard access read audit log"
  on public.faq_audit_log for select
  using (public.has_staff_permission('dashboard'));

create or replace function public.admin_faq_view_stats()
returns table (
  faq_id uuid, faq_code text, category text, question text,
  views bigint, views_7d bigint, last_viewed timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_staff_permission('dashboard') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select f.id, f.faq_code, f.category, f.question,
           count(v.id),
           count(v.id) filter (where v.viewed_at > now() - interval '7 days'),
           max(v.viewed_at)
    from public.faqs f
    left join public.faq_views v on v.faq_id = f.id
    group by f.id
    order by count(v.id) desc, f.faq_code;
end;
$$;

create or replace function public.admin_view_totals()
returns table (page_visits bigint, page_visits_7d bigint, faq_opens bigint, faq_opens_7d bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_staff_permission('dashboard') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select count(*) filter (where faq_id is null),
           count(*) filter (where faq_id is null and viewed_at > now() - interval '7 days'),
           count(*) filter (where faq_id is not null),
           count(*) filter (where faq_id is not null and viewed_at > now() - interval '7 days')
    from public.faq_views;
end;
$$;

-- Staff list now includes permissions (return type changed, so drop first).
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  email text, role text, has_login boolean, last_sign_in_at timestamptz, created_at timestamptz,
  can_add boolean, can_edit boolean, can_delete boolean, can_view_dashboard boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can view staff accounts.';
  end if;
  return query
    select e.email, e.role, u.id is not null, u.last_sign_in_at, u.created_at,
           e.can_add, e.can_edit, e.can_delete, e.can_view_dashboard
    from public.faq_editors e
    left join auth.users u on lower(u.email) = lower(e.email)
    order by (e.role = 'super_admin') desc, e.email;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_permissions(
  p_email text, p_can_add boolean, p_can_edit boolean, p_can_delete boolean, p_can_view_dashboard boolean
)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can change permissions.';
  end if;
  update public.faq_editors
    set can_add = p_can_add, can_edit = p_can_edit, can_delete = p_can_delete, can_view_dashboard = p_can_view_dashboard
    where lower(email) = lower(trim(p_email)) and role <> 'super_admin';
  if not found then
    raise exception 'Permissions can only be changed for editor accounts (super admins always have full access).';
  end if;
end;
$$;
revoke all on function public.admin_set_permissions(text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_permissions(text, boolean, boolean, boolean, boolean) to authenticated;

-- 12. Edit / delete scope per staff member: none, own FAQs only, or any FAQ ---------
-- Each FAQ now records who created it (backfilled from the audit log; older seeded FAQs
-- have no creator, so only staff with "any" scope can edit or delete them).
alter table public.faqs add column if not exists created_by text;
update public.faqs f
  set created_by = (select lower(l.actor_email) from public.faq_audit_log l
                    where l.faq_id = f.id and l.action = 'created' and l.actor_email is not null
                    order by l.created_at limit 1)
  where f.created_by is null;

alter table public.faq_editors
  add column if not exists edit_scope text not null default 'all',
  add column if not exists delete_scope text not null default 'all';

-- Carry over the old on/off switches (only while they still exist).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'faq_editors' and column_name = 'can_edit') then
    execute $q$
      update public.faq_editors
        set edit_scope = case when can_edit then 'all' else 'none' end,
            delete_scope = case when can_delete then 'all' else 'none' end
    $q$;
  end if;
end $$;

alter table public.faq_editors drop constraint if exists faq_editors_edit_scope_check;
alter table public.faq_editors add constraint faq_editors_edit_scope_check check (edit_scope in ('none', 'own', 'all'));
alter table public.faq_editors drop constraint if exists faq_editors_delete_scope_check;
alter table public.faq_editors add constraint faq_editors_delete_scope_check check (delete_scope in ('none', 'own', 'all'));

-- 'edit' / 'delete' -> 'none' | 'own' | 'all' for the signed-in user. Super admins: 'all'.
create or replace function public.staff_scope(p_action text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when e.role = 'super_admin' then 'all'
      when p_action = 'edit' then e.edit_scope
      when p_action = 'delete' then e.delete_scope
      else 'none'
    end
    from public.faq_editors e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
  ), 'none');
$$;
revoke all on function public.staff_scope(text) from public, anon;
grant execute on function public.staff_scope(text) to authenticated;

create or replace function public.can_modify_faq(p_action text, p_created_by text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case public.staff_scope(p_action)
    when 'all' then true
    when 'own' then p_created_by is not null and lower(p_created_by) = lower(auth.jwt() ->> 'email')
    else false
  end;
$$;
revoke all on function public.can_modify_faq(text, text) from public, anon;
grant execute on function public.can_modify_faq(text, text) to authenticated;

create or replace function public.has_staff_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when e.role = 'super_admin' then true
      when p_permission = 'add' then e.can_add
      when p_permission = 'edit' then e.edit_scope <> 'none'
      when p_permission = 'delete' then e.delete_scope <> 'none'
      when p_permission = 'dashboard' then e.can_view_dashboard
      else false
    end
    from public.faq_editors e
    where lower(e.email) = lower(auth.jwt() ->> 'email')
  ), false);
$$;

create or replace function public.faq_permission_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by; -- the creator is never reassigned
  end if;
  if auth.jwt() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if not public.has_staff_permission('add') then
      raise exception 'You do not have permission to add FAQs.' using errcode = '42501';
    end if;
    new.created_by := lower(auth.jwt() ->> 'email');
  elsif tg_op = 'UPDATE'
        and (to_jsonb(new) - 'sort_order' - 'updated_at') is distinct from (to_jsonb(old) - 'sort_order' - 'updated_at')
        and not public.can_modify_faq('edit', old.created_by) then
    if public.staff_scope('edit') = 'own' then
      raise exception 'You can only edit FAQs you created.' using errcode = '42501';
    end if;
    raise exception 'You do not have permission to edit FAQs.' using errcode = '42501';
  elsif tg_op = 'DELETE' and not public.can_modify_faq('delete', old.created_by) then
    if public.staff_scope('delete') = 'own' then
      raise exception 'You can only delete FAQs you created.' using errcode = '42501';
    end if;
    raise exception 'You do not have permission to delete FAQs.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  email text, role text, has_login boolean, last_sign_in_at timestamptz, created_at timestamptz,
  can_add boolean, edit_scope text, delete_scope text, can_view_dashboard boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can view staff accounts.';
  end if;
  return query
    select e.email, e.role, u.id is not null, u.last_sign_in_at, u.created_at,
           e.can_add, e.edit_scope, e.delete_scope, e.can_view_dashboard
    from public.faq_editors e
    left join auth.users u on lower(u.email) = lower(e.email)
    order by (e.role = 'super_admin') desc, e.email;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

drop function if exists public.admin_set_permissions(text, boolean, boolean, boolean, boolean);
create or replace function public.admin_set_permissions(
  p_email text, p_can_add boolean, p_edit_scope text, p_delete_scope text, p_can_view_dashboard boolean
)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can change permissions.';
  end if;
  if p_edit_scope not in ('none', 'own', 'all') or p_delete_scope not in ('none', 'own', 'all') then
    raise exception 'Scope must be none, own or all.';
  end if;
  update public.faq_editors
    set can_add = p_can_add, edit_scope = p_edit_scope, delete_scope = p_delete_scope,
        can_view_dashboard = p_can_view_dashboard
    where lower(email) = lower(trim(p_email)) and role <> 'super_admin';
  if not found then
    raise exception 'Permissions can only be changed for editor accounts (super admins always have full access).';
  end if;
end;
$$;
revoke all on function public.admin_set_permissions(text, boolean, text, text, boolean) from public, anon;
grant execute on function public.admin_set_permissions(text, boolean, text, text, boolean) to authenticated;

-- The old on/off columns are replaced by the scopes above.
alter table public.faq_editors drop column if exists can_edit, drop column if exists can_delete;

notify pgrst, 'reload schema';
