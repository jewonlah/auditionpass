-- The view owner controls table access, but function EXECUTE is checked for
-- the querying role. Keep the fingerprint private; use the existing boolean
-- SECURITY DEFINER entry point, which reads the live row by its ID.
begin;
create or replace view public.public_auditions as
select a.id,a.title,a.company,a.genre,a.category,a.deadline,a.description,a.requirements,
 a.source_url,a.source_name,a.apply_type,a.is_active,a.oneclick_blocked,a.reports_count,
 a.review_status,a.crawled_at,a.created_at,a.quality_score,
 public.application_ready(a) as application_ready
from public.auditions a
where a.is_active and a.review_status in ('auto','approved');
commit;
