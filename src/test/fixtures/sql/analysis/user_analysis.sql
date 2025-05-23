-- This is an analysis file and should not be decorated
select count(*) from {{ ref('dim_users') }}