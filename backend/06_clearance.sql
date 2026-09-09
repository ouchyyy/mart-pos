-- ============================================================
-- FILE 6 of 7 — CLEARANCE ON SHORT-DATED STOCK
--
-- Food about to go off is worth more sold cheap than thrown
-- away. A shop that waits until the last day throws it away; a
-- shop that marks it down early gets something back.
--
-- The rule lives here rather than in the website for the same
-- reason the stock rules do: there is then one answer to "what
-- does this cost today", and every screen gets the same one.
--
-- Run this after file 5. The rules about who may CHANGE the
-- steps live in file 7 with all the other permissions.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The steps, as data rather than as code
--
-- A table, not an IF inside a function, so the shop can change
-- its own rule without anybody editing SQL. Add a row for a new
-- step; delete one to remove it.
-- ------------------------------------------------------------
create table clearance_rules (
  id          bigserial primary key,
  days_before integer not null unique,
  percent_off integer not null check (percent_off between 1 and 100)
);

insert into clearance_rules (days_before, percent_off) values
  (14, 50),
  (7, 75);


-- ------------------------------------------------------------
-- 2. What percentage off, for a given expiry date
--
-- Picks the biggest discount whose window the date has entered.
-- Something 5 days out is inside both the 14-day and the 7-day
-- window, and should get the 75%, not the 50%.
--
-- Two cases deliberately return zero:
--
--   no expiry date  -- soap does not go off
--   already expired -- it should be written off, not sold. A
--                      system offering 75% off out-of-date food
--                      is nudging the shop into selling it.
-- ------------------------------------------------------------
create function clearance_percent(the_expiry date)
returns integer
language sql
stable
as $$
  select coalesce(
    (select max(percent_off)
       from clearance_rules
      where the_expiry is not null
        and the_expiry >= current_date
        and the_expiry <= current_date + days_before),
    0
  );
$$;


-- ------------------------------------------------------------
-- 3. One place the app reads products from
--
-- Everything about a product plus what it costs today. The
-- website no longer works the discount out for itself, so the
-- till, the reports and the stock list cannot disagree.
--
-- category_name is flattened in here too, so a page can show it
-- without a second lookup.
-- ------------------------------------------------------------
create view products_for_sale as
select p.*,
       c.name                                as category_name,
       clearance_percent(p.expiry_date)      as clearance_percent,
       round(
         p.selling_price * (1 - clearance_percent(p.expiry_date) / 100.0),
         2
       )                                     as price_today,
       (p.expiry_date - current_date)        as days_to_expiry
  from products p
  left join categories c on c.id = p.category_id;


-- ------------------------------------------------------------
-- 4. Who may read it
--
-- The view reads through to products, which is already locked
-- down, but a view needs its own grant.
-- ------------------------------------------------------------
grant select on products_for_sale to authenticated;


-- ------------------------------------------------------------
-- Check it works
-- ------------------------------------------------------------
-- select clearance_percent(current_date + 20);  -- 0,  too far off
-- select clearance_percent(current_date + 10);  -- 50, inside 14 days
-- select clearance_percent(current_date + 3);   -- 75, inside 7 days
-- select clearance_percent(current_date - 1);   -- 0,  already expired
-- select clearance_percent(null);               -- 0,  does not go off
