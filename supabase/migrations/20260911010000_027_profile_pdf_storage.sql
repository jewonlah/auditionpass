-- Server-only, immutable PDF objects. User access goes through authenticated API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-documents','profile-documents',false,3145728,array['application/pdf'])
on conflict(id) do update set public=false, file_size_limit=3145728, allowed_mime_types=array['application/pdf'];
-- Restrictive policy also guards against any broad authenticated storage policies.
create policy "프로필 PDF 서버 전용" on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'profile-documents') with check (bucket_id <> 'profile-documents');
