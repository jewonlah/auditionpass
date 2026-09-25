insert into auditions(id,title,description,apply_email,deadline,apply_type,is_active,oneclick_blocked,review_status)
values
('99999999-9999-4999-8999-999999999991','Public reviewed','Fixture','nobody@example.test',current_date+2,'email',true,false,'approved'),
('99999999-9999-4999-8999-999999999992','Public unreviewed','Fixture','nobody@example.test',current_date+2,'email',true,false,'auto'),
('99999999-9999-4999-8999-999999999993','Private','Fixture','nobody@example.test',current_date+2,'email',false,false,'approved');
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by)
select id,application_source_fingerprint(a),false,'fixture' from auditions a where id in ('99999999-9999-4999-8999-999999999991','99999999-9999-4999-8999-999999999993');
revoke select on auditions from anon,authenticated;
set role anon;
do $$ begin
 if (select count(*) from public_auditions)<>2 then raise exception 'publication predicate changed'; end if;
 if (select count(*) from public_auditions where application_ready)<>1 then raise exception 'readiness mismatch'; end if;
 if has_table_privilege(current_user,'auditions','select') or has_function_privilege(current_user,'application_source_fingerprint(auditions)','execute') then raise exception 'private access widened'; end if;
 begin perform apply_email from auditions; raise exception 'private table exposed'; exception when insufficient_privilege then null; end;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='public_auditions' and column_name='apply_email') then raise exception 'email projected'; end if;
end $$;
reset role;
set role authenticated;
do $$ begin
 if (select count(*) from public_auditions where application_ready)<>1 then raise exception 'authenticated read failed'; end if;
 if has_table_privilege(current_user,'auditions','select') or has_function_privilege(current_user,'application_source_fingerprint(auditions)','execute') then raise exception 'private access widened'; end if;
end $$;
reset role;
update auditions set oneclick_blocked=true where id='99999999-9999-4999-8999-999999999991';
set role anon;
do $$ begin
 if exists(select 1 from public_auditions where application_ready) then raise exception 'blocked row ready'; end if;
end $$;
reset role;
select '039 public role checks passed';
