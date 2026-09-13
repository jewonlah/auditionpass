select json_build_object(
 'inventory',(select json_build_object('total',count(*),'active',count(*) filter(where is_active),'active_email',count(*) filter(where is_active and apply_type='email' and apply_email is not null),'expired_active',count(*) filter(where is_active and deadline < (now() at time zone 'Asia/Seoul')::date),'collected_24h',count(*) filter(where crawled_at > now()-interval '24 hours'),'last_crawled',max(crawled_at)) from auditions),
 'sources',(select json_agg(x) from (select source_name,count(*) filter(where is_active) as active,count(*) filter(where crawled_at > now()-interval '24 hours') as touched_24h,max(crawled_at) as latest from auditions group by source_name order by active desc limit 20) x),
 'log_columns',(select json_agg(column_name) from information_schema.columns where table_schema='public' and table_name='crawl_logs'),
 'other_tables',(select json_agg(table_name) from information_schema.tables where table_schema='public' and (table_name like '%social%' or table_name like '%sns%' or table_name like '%crawl%'))
) as audit;
