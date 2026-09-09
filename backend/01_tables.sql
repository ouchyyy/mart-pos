-- ============================================================
-- FILE 1 of 7 — THE TABLES
--
-- Seven tables and nothing else: no rules, no permissions, just
-- the shape of the data.
--
-- The one idea to understand before reading anything else: a
-- product does NOT hold its stock as a number you type. Stock
-- lives in batches, and the number on the product is added up
-- from them. File 3 does that adding up.
-- ============================================================

-- ------------------------------------------------------------
-- Staff
--
-- Supabase keeps passwords in its own auth.users table, so here
-- we only store what the shop needs: a name and what they may do.
-- ------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'cashier',
  created_at timestamptz default now()
);


-- ------------------------------------------------------------
-- Product groups, like Drinks or Snacks
-- ------------------------------------------------------------
create table categories (
  id   bigserial primary key,
  name text not null unique
);


-- ------------------------------------------------------------
-- The products we sell
--
-- Two warnings, about two different problems:
--
--   low_stock_at      warn when this many or fewer are left
--   expiry_warn_days  warn this many days before it goes off
--
-- Both are per product, because the right answer differs. Milk
-- needs three days' notice; tinned fish can have thirty. Bread
-- sells out in a day, so warn at 20; rice at 5 is plenty.
--
-- stock_quantity and expiry_date are worked out from the batches
-- by recount_product() in file 2. Never write them by hand.
-- ------------------------------------------------------------
create table products (
  id             bigserial primary key,
  name           text not null,
  barcode        text unique,
  category_id    bigint references categories(id),
  image_url      text,
  cost_price     numeric(10,2) not null default 0,
  selling_price  numeric(10,2) not null default 0,
  stock_quantity integer not null default 0,
  low_stock_at     integer not null default 10,
  expiry_warn_days integer not null default 14,
  expiry_date    date,
  is_active      boolean not null default true,
  created_at     timestamptz default now()
);


-- ------------------------------------------------------------
-- Batches
--
-- One delivery of one product is one batch. Twelve bottles that
-- came on Monday and expire in June are one batch; twelve more
-- arriving in May are another, even though they are the same
-- product.
--
-- This is what lets the till sell the oldest milk first instead
-- of picking at random.
-- ------------------------------------------------------------
create table product_batches (
  id                bigserial primary key,
  product_id        bigint not null references products(id) on delete cascade,
  batch_no          text,
  quantity_received integer not null,
  quantity_left     integer not null,
  cost_price        numeric(10,2) not null default 0,
  expiry_date       date,
  note              text,
  received_at       timestamptz default now()
);


-- ------------------------------------------------------------
-- Sales
--
-- Four money columns, not one. If we only kept the final total,
-- nobody could ever answer "how much did we give away last
-- month?" — which is the first thing an owner asks when the
-- takings look thin.
--
--   subtotal      what it would have cost at full price
--   item_discount money taken off single lines, added up
--   discount      money taken off the whole sale
--   total         what the customer actually paid
-- ------------------------------------------------------------
create table sales (
  id             bigserial primary key,
  invoice_no     text not null,
  cashier_id     uuid references profiles(id),
  subtotal       numeric(10,2) not null default 0,
  item_discount  numeric(10,2) not null default 0,
  discount       numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  paid           numeric(10,2) not null default 0,
  change_given   numeric(10,2) not null default 0,
  payment_method text not null default 'cash',
  status         text not null default 'completed',
  created_at     timestamptz default now()
);


-- ------------------------------------------------------------
-- What was in each sale
--
-- The name and price are copied in here on purpose. Changing a
-- product's price tomorrow must not change what an old receipt
-- says it was sold for.
-- ------------------------------------------------------------
create table sale_items (
  id           bigserial primary key,
  sale_id      bigint not null references sales(id) on delete cascade,
  product_id   bigint not null references products(id),
  product_name text not null,
  price        numeric(10,2) not null,
  quantity     integer not null,
  discount     numeric(10,2) not null default 0,
  line_total   numeric(10,2) not null
);


-- ------------------------------------------------------------
-- Every stock change ever
--
-- Written only by the functions in file 2, never typed in, so it
-- can always answer "why does this product say 12?".
-- ------------------------------------------------------------
create table stock_movements (
  id          bigserial primary key,
  product_id  bigint not null references products(id) on delete cascade,
  staff_id    uuid references profiles(id),
  batch_id    bigint references product_batches(id) on delete set null,
  change      integer not null,     -- negative when stock goes down
  reason      text not null,        -- 'sale', 'restock', 'expired', 'correction'
  stock_after integer not null,
  note        text,
  created_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- Indexes — the columns we search and sort by most
-- ------------------------------------------------------------
create index on products (name);
create index on products (barcode);
create index on sales (created_at);
create index on sale_items (sale_id);
create index on stock_movements (product_id, created_at desc);

-- The order the till sells in: soonest expiry first, then oldest
-- delivery. This index is what makes that lookup quick.
create index on product_batches (product_id, expiry_date, received_at);
