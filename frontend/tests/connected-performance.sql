insert into auditions(id,title,company,description,apply_email,apply_type,is_active,oneclick_blocked,review_status,deadline)
select gen_random_uuid(),'Perf fixture '||n,'Fixture company',repeat('Adult role and submission requirements. ',50),'perf@example.test','email',true,false,'approved',current_date+10
from generate_series(1,6000) n;
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by)
select id,application_source_fingerprint(a),false,'performance fixture' from auditions a where title like 'Perf fixture%' and right(id::text,1) in ('0','1');
analyze auditions;
analyze audition_application_reviews;
explain (analyze,buffers) select count(*) from public_auditions where application_ready=true;
