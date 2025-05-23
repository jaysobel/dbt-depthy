select 
    o.order_id,
    o.user_id,
    u.name as user_name,
    o.amount,
    o.created_at
from {{ ref('intermediate_user_orders') }} o
join {{ ref('dim_users') }} u on o.user_id = u.user_id