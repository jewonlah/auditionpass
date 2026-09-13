set role service_role;
insert into public.materials(id,user_id,name,kind,mime_type,size_bytes,storage_path) values
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','첫 PDF','document','application/pdf',100,'11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.pdf'),
('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','다른 사람','document','application/pdf',100,'22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444.pdf');
reset role;
insert into storage.objects values ('33333333-3333-4333-8333-333333333333','materials');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ begin
  if (select count(*) from public.materials) <> 1 then raise exception 'Owner RLS failed'; end if;
  if exists(select 1 from storage.objects where bucket_id='materials') then raise exception 'Private storage isolation failed'; end if;
  begin
    delete from public.materials;
    raise exception 'Client delete must fail';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.materials default values;
    raise exception 'Client insert must fail';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select public from storage.buckets where id='materials') then raise exception 'Bucket public'; end if;
  if (select file_size_limit from storage.buckets where id='materials') <> 3145728 then raise exception 'Size limit'; end if;
  if has_table_privilege('anon','public.materials','select') then raise exception 'Anonymous select'; end if;
  begin
    update public.materials set storage_path='22222222-2222-4222-8222-222222222222/stolen.pdf' where id='33333333-3333-4333-8333-333333333333';
    raise exception 'Cross-owner path allowed';
  exception when check_violation then null; end;
  begin
    update public.materials set size_bytes=3145729;
    raise exception 'Oversize allowed';
  exception when check_violation then null; end;
end $$;
set role service_role;
do $$ declare material_id uuid; begin
  for counter in 1..99 loop
    material_id := gen_random_uuid();
    insert into materials(id,user_id,name,kind,mime_type,size_bytes,storage_path) values(material_id,'11111111-1111-4111-8111-111111111111','사진','photo','image/png',100,'11111111-1111-4111-8111-111111111111/' || material_id::text || '.png');
  end loop;
  material_id := gen_random_uuid();
  begin
    insert into materials(id,user_id,name,kind,mime_type,size_bytes,storage_path) values(material_id,'11111111-1111-4111-8111-111111111111','초과','photo','image/png',100,'11111111-1111-4111-8111-111111111111/' || material_id::text || '.png');
    raise exception 'Quota not enforced';
  exception when check_violation then null; end;
end $$;
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$ begin
  if (select count(*) from materials) <> 1 then raise exception 'Account cascade or other owner preservation failed'; end if;
end $$;
select 'Material library: owner RLS, private storage, client write denial, quota, constraints, cascade passed' as result;
