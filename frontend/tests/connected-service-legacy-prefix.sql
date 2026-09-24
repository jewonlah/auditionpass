insert into auditions(id,title,apply_email,apply_type,is_active,oneclick_blocked,review_status)
values('99999999-9999-4999-8999-999999999992','Historical source','legacy@example.test','email',false,false,'auto');
insert into applications(id,user_id,audition_id,status)
values('99999999-9999-4999-8999-999999999991','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999992','sending');
insert into application_delivery_jobs(id,application_id,mode,provider_id)
values('99999999-9999-4999-8999-999999999993','99999999-9999-4999-8999-999999999991','production','before-migration-provider');

insert into auditions(id,title,apply_email,apply_type,is_active,oneclick_blocked,review_status) values
('99999999-9999-4999-8999-999999999982','Legacy failed fixture','legacy@example.test','email',false,false,'auto'),
('99999999-9999-4999-8999-999999999985','Legacy jobless fixture','legacy@example.test','email',false,false,'auto');
insert into applications(id,user_id,audition_id,status) values
('99999999-9999-4999-8999-999999999984','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999982','failed'),
('99999999-9999-4999-8999-999999999981','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999985','sending');
insert into application_delivery_jobs(id,application_id,mode) values
('99999999-9999-4999-8999-999999999983','99999999-9999-4999-8999-999999999984','production');
