-- ============================================================
-- FILE 4 of 7 — THE SALE RULES
--
--   make_invoice_no  numbers like INV-20260909-0001
--   save_sale        a whole sale, all of it or none of it
--   cancel_sale      undo a sale and put the stock back
--
-- save_sale is the most important function in the system. It is
-- worth reading even if you skip the rest.
--
-- Needs file 3 first: save_sale calls take_stock.
-- ============================================================


-- ------------------------------------------------------------
-- Invoice numbers like INV-20260909-0001
-- ------------------------------------------------------------
create sequence invoice_counter;

create function make_invoice_no()
returns text
language sql
as $$
  select 'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||
         lpad(nextval('invoice_counter')::text, 4, '0');
$$;


-- ------------------------------------------------------------
-- Save a whole sale
--
-- The most important function here. Selling means four jobs:
-- make the sale, save each item, take the stock away, and write
-- the history. Because they all happen inside one function they
-- either ALL happen or NONE of them do. If the third product has
-- no stock, the first two are undone as well. There is no such
-- thing as half a sale.
--
-- cart looks like:
--   [{"product_id": 3, "quantity": 2, "discount": 0.50}, ...]
--
-- "discount" is money off that whole line and is optional.
--
-- Two kinds of discount, and the order matters. Item discounts
-- come off first, then the discount on the whole sale comes off
-- what is left. The other way round, a percentage could be taken
-- from a price nobody ever paid.
-- ------------------------------------------------------------
create function save_sale(
  cart           jsonb,
  money_received numeric,
  how_they_paid  text    default 'cash',
  the_discount   numeric default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_sale_id          bigint;
  item                 jsonb;
  the_product          products%rowtype;
  how_many             integer;
  line_before          numeric(10,2);
  line_discount        numeric(10,2);
  sale_subtotal        numeric(10,2) := 0;
  sale_item_discount   numeric(10,2) := 0;
  after_item_discounts numeric(10,2);
  sale_discount        numeric(10,2);
  sale_total           numeric(10,2);
begin
  if jsonb_array_length(cart) = 0 then
    raise exception 'The cart is empty';
  end if;

  if the_discount < 0 then
    raise exception 'A discount cannot be a negative number';
  end if;

  -- Make the sale first so we have an id for the items.
  insert into sales (invoice_no, cashier_id, paid, payment_method)
  values (make_invoice_no(), auth.uid(), money_received, how_they_paid)
  returning id into new_sale_id;

  for item in select * from jsonb_array_elements(cart)
  loop
    how_many := (item->>'quantity')::int;

    select * into the_product
      from products
     where id = (item->>'product_id')::bigint;

    if not found then
      raise exception 'One of the products no longer exists';
    end if;

    line_before := the_product.selling_price * how_many;

    -- coalesce turns a missing discount into zero, so a cart
    -- without the field still works.
    line_discount := coalesce((item->>'discount')::numeric, 0);

    if line_discount < 0 then
      raise exception 'A discount cannot be a negative number';
    end if;

    -- Never give away more than the line is worth.
    line_discount := least(line_discount, line_before);

    insert into sale_items
      (sale_id, product_id, product_name, price, quantity, discount, line_total)
    values
      (new_sale_id, the_product.id, the_product.name,
       the_product.selling_price, how_many, line_discount,
       line_before - line_discount);

    -- Raises an error if there is not enough stock, which undoes
    -- everything above it.
    perform take_stock(the_product.id, how_many, 'sale', null);

    sale_subtotal      := sale_subtotal + line_before;
    sale_item_discount := sale_item_discount + line_discount;
  end loop;

  after_item_discounts := sale_subtotal - sale_item_discount;
  sale_discount        := least(the_discount, after_item_discounts);
  sale_total           := after_item_discounts - sale_discount;

  if how_they_paid = 'cash' and money_received < sale_total then
    raise exception 'The customer gave % but the total is %',
      money_received, sale_total;
  end if;

  update sales
     set subtotal      = sale_subtotal,
         item_discount = sale_item_discount,
         discount      = sale_discount,
         total         = sale_total,
         change_given  = greatest(money_received - sale_total, 0)
   where id = new_sale_id;

  return new_sale_id;
end;
$$;


-- ------------------------------------------------------------
-- Cancel a sale and put the stock back
--
-- The sale is never deleted. It stays, marked cancelled, so the
-- history stays honest about what happened.
--
-- The stock returns as a new batch. We cannot know which batch
-- it came out of originally, and guessing would be worse than
-- admitting it.
-- ------------------------------------------------------------
create function cancel_sale(the_sale_id bigint, the_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  the_sale sales%rowtype;
  item     record;
begin
  select * into the_sale from sales where id = the_sale_id;

  if not found then
    raise exception 'Sale not found';
  end if;

  if the_sale.status <> 'completed' then
    raise exception 'This sale was already cancelled';
  end if;

  for item in select product_id, quantity from sale_items where sale_id = the_sale_id
  loop
    perform add_batch(item.product_id, item.quantity, 0, null, null,
                      'cancelled sale', the_reason);
  end loop;

  update sales set status = 'cancelled' where id = the_sale_id;
end;
$$;
