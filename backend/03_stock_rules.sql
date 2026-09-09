-- ============================================================
-- FILE 3 of 7 — THE STOCK RULES
--
-- Four functions, and one rule they all serve: the number on a
-- product is never typed in. It is added up from the batches
-- after every change, so it can never drift away from them.
--
--   recount_product  add a product's batches up
--   add_batch        stock coming in
--   take_stock       stock going out, soonest to expire first
--   change_stock     a shortcut that picks one of the two above
-- ============================================================


-- ------------------------------------------------------------
-- Add a product's batches up
--
-- Nothing else ever writes products.stock_quantity. It is worked
-- out here instead, so the number on the product can never
-- disagree with the batches behind it.
--
-- The expiry date shown on the product is the EARLIEST one still
-- on the shelf, because that is the one to worry about first.
-- ------------------------------------------------------------
create function recount_product(the_product_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total          integer;
  soonest_expiry date;
begin
  select coalesce(sum(quantity_left), 0),
         min(expiry_date) filter (where quantity_left > 0)
    into total, soonest_expiry
    from product_batches
   where product_id = the_product_id;

  update products
     set stock_quantity = total,
         expiry_date    = soonest_expiry
   where id = the_product_id;

  return total;
end;
$$;


-- ------------------------------------------------------------
-- Stock coming IN — always makes a new batch
--
-- Admins only. A cashier changing stock by hand would make the
-- numbers meaningless, and hiding the button is not enough on
-- its own: anyone who knew how could still call this directly.
-- ------------------------------------------------------------
create function add_batch(
  the_product_id bigint,
  how_many       integer,
  the_cost       numeric default 0,
  the_expiry     date    default null,
  the_batch_no   text    default null,
  the_reason     text    default 'restock',
  the_note       text    default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role  text;
  stock_after  integer;
  new_batch_id bigint;
begin
  select role into caller_role from profiles where id = auth.uid();

  if coalesce(caller_role, '') <> 'admin' then
    raise exception 'Only an admin can add stock';
  end if;

  if how_many <= 0 then
    raise exception 'The quantity must be more than zero';
  end if;

  insert into product_batches
    (product_id, batch_no, quantity_received, quantity_left,
     cost_price, expiry_date, note)
  values
    (the_product_id, the_batch_no, how_many, how_many,
     the_cost, the_expiry, the_note)
  returning id into new_batch_id;

  stock_after := recount_product(the_product_id);

  insert into stock_movements
    (product_id, staff_id, batch_id, change, reason, stock_after, note)
  values
    (the_product_id, auth.uid(), new_batch_id, how_many, the_reason,
     stock_after, the_note);

  return stock_after;
end;
$$;


-- ------------------------------------------------------------
-- Stock going OUT — takes from the batch expiring soonest
--
-- Shops call this FEFO: First Expired, First Out. It is what a
-- shopkeeper does by hand when they move the old milk to the
-- front of the shelf.
--
-- One sale can cross several batches. If someone buys 5 and the
-- oldest batch has 2 left, we take those 2 and 3 from the next.
--
-- Batches with no expiry date go to the back of the queue, and
-- among those we take the oldest delivery first.
-- ------------------------------------------------------------
create function take_stock(
  the_product_id bigint,
  how_many       integer,
  the_reason     text default 'sale',
  the_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role      text;
  stock_before     integer;
  stock_after      integer;
  still_needed     integer := how_many;
  take_this_many   integer;
  the_batch        record;
  the_product_name text;
  last_batch_id    bigint;
begin
  -- Selling is for everyone. Taking stock out for any other
  -- reason is an admin job.
  if the_reason <> 'sale' then
    select role into caller_role from profiles where id = auth.uid();

    if coalesce(caller_role, '') <> 'admin' then
      raise exception 'Only an admin can take stock out by hand';
    end if;
  end if;

  select name into the_product_name from products where id = the_product_id;

  if the_product_name is null then
    raise exception 'Product not found';
  end if;

  select coalesce(sum(quantity_left), 0) into stock_before
    from product_batches where product_id = the_product_id;

  if stock_before < how_many then
    raise exception 'Not enough stock for %. There are only % left.',
      the_product_name, stock_before;
  end if;

  for the_batch in
    select id, quantity_left
      from product_batches
     where product_id = the_product_id
       and quantity_left > 0
     order by expiry_date asc nulls last, received_at asc
     for update
  loop
    exit when still_needed <= 0;

    -- Take what we can from this batch, never more than it has.
    take_this_many := least(the_batch.quantity_left, still_needed);

    update product_batches
       set quantity_left = quantity_left - take_this_many
     where id = the_batch.id;

    still_needed  := still_needed - take_this_many;
    last_batch_id := the_batch.id;
  end loop;

  stock_after := recount_product(the_product_id);

  insert into stock_movements
    (product_id, staff_id, batch_id, change, reason, stock_after, note)
  values
    (the_product_id, auth.uid(), last_batch_id, -how_many, the_reason,
     stock_after, the_note);

  return stock_after;
end;
$$;


-- ------------------------------------------------------------
-- A shortcut: positive adds, negative takes away
-- ------------------------------------------------------------
create function change_stock(
  the_product_id bigint,
  the_change     integer,
  the_reason     text,
  the_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if the_change > 0 then
    return add_batch(the_product_id, the_change, 0, null, null,
                     the_reason, the_note);
  else
    return take_stock(the_product_id, -the_change, the_reason, the_note);
  end if;
end;
$$;
