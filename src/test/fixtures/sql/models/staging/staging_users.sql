select 
    user_id,
    name,
    email
from {{ ref('raw_users') }}