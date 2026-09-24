begin;
-- Owner-executed projection deliberately applies its own publication predicate.
create or replace view public.public_auditions as
select a.id,a.title,a.company,a.genre,a.category,a.deadline,a.description,a.requirements,
 a.source_url,a.source_name,a.apply_type,a.is_active,a.oneclick_blocked,a.reports_count,
 a.review_status,a.crawled_at,a.created_at,a.quality_score,
 case when r.audition_id is null then false else
 not coalesce(a.oneclick_blocked,true) and (a.deadline is null or a.deadline >= (now() at time zone 'Asia/Seoul')::date)
 and a.apply_type='email' and nullif(a.apply_email,'') is not null and not r.minor_role and cardinality(r.required_materials)=0
 and r.fingerprint=public.application_source_fingerprint(a)
 and not exists(select 1 from public.suppression s where
 (s.kind='email' and lower(a.apply_email)=lower(s.value)) or (s.kind='source' and coalesce(a.source_name,'') ilike s.value||'%') or
 (s.kind='domain' and (lower(a.apply_email) like '%@'||lower(s.value) or lower(coalesce(a.source_url,'')) like '%'||lower(s.value)||'%')))
 end as application_ready
from public.auditions a left join public.audition_application_reviews r on r.audition_id=a.id where a.is_active and a.review_status in ('auto','approved');
revoke all on public.public_auditions from public;
grant select on public.public_auditions to anon,authenticated,service_role;

create or replace function public.owned_audition_references(p_ids uuid[]) returns setof jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'title',a.title,'company',a.company,'genre',a.genre,'category',a.category,
 'deadline',a.deadline,'is_active',a.is_active,'oneclick_blocked',a.oneclick_blocked,'apply_type',a.apply_type,
 'application_ready',public.application_ready(a),'is_public',a.is_active and a.review_status in ('auto','approved'),
 'source_url',case when a.is_active and a.review_status in ('auto','approved') then a.source_url end,
 'source_name',case when a.is_active and a.review_status in ('auto','approved') then a.source_name end,
 'review_status',case when a.is_active and a.review_status in ('auto','approved') then a.review_status end,
 'reports_count',case when a.is_active and a.review_status in ('auto','approved') then a.reports_count end,'created_at',a.created_at)
 from public.auditions a where auth.uid() is not null and cardinality(p_ids)<=1000 and a.id=any(p_ids)
 and exists(select 1 from auth.users u where u.id=auth.uid())
 and (exists(select 1 from public.applications x where x.user_id=auth.uid() and x.audition_id=a.id)
 or exists(select 1 from public.bookmarks b where b.user_id=auth.uid() and b.audition_id=a.id)
 or exists(select 1 from public.reports r where r.reporter_id=auth.uid() and r.audition_id=a.id));
$$;
revoke all on function public.owned_audition_references(uuid[]) from public,anon;
grant execute on function public.owned_audition_references(uuid[]) to authenticated;
-- Do not let a newly fabricated bookmark grant access to an unpublished title.
create or replace function public.check_bookmark_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.public_auditions where id=new.audition_id) then raise exception 'AUDITION_UNAVAILABLE'; end if;
 return new;
end; $$;
revoke all on function public.check_bookmark_publication() from public,anon,authenticated;
drop trigger if exists bookmark_publication on public.bookmarks;
create trigger bookmark_publication before insert or update of audition_id on public.bookmarks for each row execute function public.check_bookmark_publication();
commit;
