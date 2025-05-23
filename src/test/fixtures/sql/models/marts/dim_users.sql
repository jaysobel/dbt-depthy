select 
    user_id,
    name,
    email,
    created_at
from {{ ref('staging_users') }}
where email is not null