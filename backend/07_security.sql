-- ============================================================
-- FILE 7 of 7 — TURN ON SECURITY  (run this last)
--
-- RUN THIS LAST, and only after you have made your own account
-- an admin:
--
--   update profiles set role = 'admin', full_name = 'Your Name'
--   where id = (select id from auth.users
--                where email = 'admin@mart.local');
--
-- Run it before that and you lock yourself out of your own
-- product screen, because only admins may edit products.
--
-- These rules live in the database, not in the website. So even
-- if someone reached the data another way, they still could not
-- delete a product unless they are an admin.
-- ============================================================


-- A small helper, so the same check is not repeated in every rule.
create function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;


-- Turn the rules on. After this a table gives back NOTHING
-- unless a rule below allows it.
alter table profiles        enable row level security;
alter table categories      enable row level security;
alter table products        enable row level security;
alter table product_batches enable row level security;
alter table sales           enable row level security;
alter table sale_items      enable row level security;
alter table stock_movements enable row level security;
alter table clearance_rules enable row level security;


-- Staff see their own profile. Admins see and change everyone.
create policy "see my profile" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "admin manages staff" on profiles
  for all using (is_admin()) with check (is_admin());


-- Anyone signed in may read the catalogue. Only an admin changes it.
create policy "everyone reads categories" on categories
  for select to authenticated using (true);

create policy "admin changes categories" on categories
  for all using (is_admin()) with check (is_admin());

create policy "everyone reads products" on products
  for select to authenticated using (true);

create policy "admin changes products" on products
  for all using (is_admin()) with check (is_admin());


-- Batches and the movement log are readable by staff, but written
-- only by the functions in file 2, so nobody can quietly edit the
-- history.
create policy "staff read batches" on product_batches
  for select to authenticated using (true);

create policy "staff read stock history" on stock_movements
  for select to authenticated using (true);


-- A cashier sees their own sales. An admin sees all of them.
-- Nobody inserts a sale directly; save_sale() does that.
create policy "read sales" on sales
  for select using (cashier_id = auth.uid() or is_admin());

create policy "read sale items" on sale_items
  for select using (
    exists (
      select 1 from sales
       where sales.id = sale_items.sale_id
         and (sales.cashier_id = auth.uid() or is_admin())
    )
  );


-- The clearance steps: everyone needs to read them to know a
-- price, but only an admin decides what they are.
create policy "everyone reads clearance rules" on clearance_rules
  for select to authenticated using (true);

create policy "admin changes clearance rules" on clearance_rules
  for all using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- Product pictures
--
-- Make the bucket by hand first:
--   Storage -> New bucket -> name it "products" -> tick Public
--
-- The picture file lives in Storage; the products table only
-- keeps its web address. Databases are for small facts, and file
-- stores are for files.
-- ------------------------------------------------------------
drop policy if exists "staff upload pictures" on storage.objects;
drop policy if exists "staff replace pictures" on storage.objects;
drop policy if exists "staff delete pictures" on storage.objects;

create policy "staff upload pictures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products');

create policy "staff replace pictures" on storage.objects
  for update to authenticated
  using (bucket_id = 'products');

create policy "staff delete pictures" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products');
