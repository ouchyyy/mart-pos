# Mart POS & Stock Management

A point-of-sale and stock system for a small shop.

**Team:** Kimsreng, Kim Boreyvina, Horng Linda, Ung Ouchy

```
mart-pos/
├── backend/    four SQL files, run in Supabase
└── frontend/   the website, built with React
```

There is no server to run. The rules of the shop live inside the database
as functions, and the website talks to it directly.

---

## What it does

- **Sell** — scan or search, add to the cart, take cash or QR, print a receipt
- **Riel** — prices are in dollars, with the riel amount shown beside them
- **Stock** — record deliveries, write off damaged goods, see the full history
- **Products** — add and edit products, prices, barcodes, expiry dates
- **Sales** — look through past sales, reprint a receipt, cancel a sale
- **Reports** — today's takings, best sellers, low stock, expiring soon
- **Staff** — admins and cashiers see different things

Cashiers work the till and look at their own sales. Admins do not have a
till at all — they get stock, products, reports and staff. An admin who
needs to sell something signs in with a cashier account, which keeps the
sales figures honest about who served whom.

---

## Setting it up

### 1. Make a Supabase project

Go to supabase.com, sign in with GitHub, press **New project**. Name it
`mart-pos` and pick the **Singapore** region. Save the database password.

Then open **Settings → API Keys** and keep that page open. You need two
things from it later: the project URL and the public key.

### 2. Create the database

Open **SQL Editor → New query**. Copy the whole of each file, paste it in,
press **Run**. Do them in this order:

1. `backend/01_tables.sql`
2. `backend/02_new_user.sql`
3. `backend/03_stock_rules.sql`
4. `backend/04_sale_rules.sql`
5. `backend/05_sample_data.sql` *(optional — skip it to start empty)*
6. `backend/06_clearance.sql`

Leave `07_security.sql` until after step 4 below, where you make yourself
an admin. That is why it is numbered last.

`backend/README.md` explains what each file is about.

### 2b. Make a place for pictures

**Storage → New bucket** → name it `products` → tick **Public bucket**.

Do this *before* running `07_security.sql`, or the rules in that
file have nothing to attach to.

### 3. Make your account

**Authentication → Add user → Create new user.**

- Email: `admin@mart.local`
- Password: anything you will remember
- Tick **Auto Confirm User** — without this you cannot sign in

Then turn off email confirmation for everyone else:
**Authentication → Sign In / Providers → Email** → untick **Confirm email**.

### 4. Become an admin, then lock the door

In the SQL Editor:

```sql
update profiles set role = 'admin', full_name = 'Your Name'
where id = (select id from auth.users where email = 'admin@mart.local');
```

**Now** run `backend/06_security.sql` — the last one.

Do it in this order. The security rules only let admins edit products, so
if you run them before making yourself an admin you lock yourself out.

### 5. Start the website

```bash
cd frontend
npm install
cp .env.example .env
```

Open `.env` and paste in the two values from step 1. Make the file inside
VS Code, not File Explorer, or Windows may name it `.env.txt` by mistake.

```bash
npm run dev
```

Open the link it prints and sign in with `admin` — just the username, not
the whole email.

---

## How the code is organised

**Backend — four SQL files**

| File | What it holds |
|---|---|
| `01_tables.sql` | the shape of the data |
| `02_new_user.sql` | give every signup a profile row |
| `03_stock_rules.sql` | how stock moves |
| `04_sale_rules.sql` | how a sale is saved |
| `05_sample_data.sql` | twelve test products (optional) |
| `06_clearance.sql` | automatic markdowns near expiry |
| `07_security.sql` | who may see and change what — **run last** |

**Frontend — one file per screen**

| File | What it is |
|---|---|
| `src/database.js` | **every** database call in the whole app |
| `src/App.jsx` | the menu, and which page is showing |
| `src/money.js` | small helpers for prices and dates |
| `src/pages/Sell.jsx` | the till |
| `src/pages/Products.jsx` | the product list and form |
| `src/pages/Stock.jsx` | what is in stock, and changing it |
| `src/pages/Movements.jsx` | everything that has happened to the stock |
| `src/pages/Sales.jsx` | past sales |
| `src/pages/Reports.jsx` | takings and warnings |
| `src/pages/Staff.jsx` | roles |
| `src/components/Receipt.jsx` | the receipt pop-up |
| `src/components/BatchesPopup.jsx` | the batches of one product |
| `src/components/CategoriesPopup.jsx` | add and rename categories |
| `src/components/DonutChart.jsx` | share of sales, drawn with one CSS gradient |
| `src/components/RankChart.jsx` | best sellers, bars on their side |
| `src/components/HoursChart.jsx` | how busy each hour of the day is |
| `src/components/QrPayment.jsx` | the QR pop-up |
| `src/khqr.js` | builds the QR code text |
| `src/styles.css` | all the styling |

If data looks wrong, open `database.js`. If a screen looks wrong, open its
page file. Nothing else touches the database.

---

## The part worth explaining in your presentation

Look at `save_sale` in `02_functions.sql`. Selling something means four
jobs: make the sale, save each item, take the stock away, and write the
history. If the shop's power cut out halfway through, you would not want
two of those done and two not done.

Because all four happen inside one database function, they either all
happen or none of them do.

**How to show it in thirty seconds.** Put two items in the cart. Make the
second one more than you have in stock. Press Charge.

You get an error, and the first item was **not** sold. Check the Sales page
— no new sale. Check the Stock page — no movement. The database undid
everything by itself.

---

## When something goes wrong

| What you see | What it usually means |
|---|---|
| A list is empty but Supabase shows rows | You have not run `03_security.sql`, or you are signed out |
| Cannot sign in | You forgot to tick **Auto Confirm User** |
| `Database error creating new user` | Re-run the `handle_new_user` block at the end of `01_create_tables.sql` |
| Cannot edit products | Your role is still `cashier` — see step 4 |
| Nothing loads at all | No `.env` file, or it was saved as `.env.txt` |
| Changes to `.env` do nothing | Stop the server and run `npm run dev` again |
| `permission denied for table` | The security rules are on but one is missing |
| A new product will not sell | Its stock is zero — add some on the Stock page |
| Product shows stock but says "Not enough stock" | Its stock was written before batches existed — add a batch on the Stock page |

The **Table Editor** in Supabase ignores the security rules. So if a table
looks full there but empty in your app, that tells you it is a rules
problem, not missing data.

---

## Putting it online

Push the project to GitHub, then go to vercel.com and import it. Set the
root directory to `frontend`, and add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the environment variables box before you press
Deploy.

Free Supabase projects go to sleep after about a week with nobody using
them. Open the dashboard a day before your presentation and ring up one
test sale, so everything is awake.


---

## The four newer features

**Cashiers cannot change stock.** The Stock page only appears for admins,
and `change_stock` checks the role in the database too. Hiding a page is
not security on its own — someone who knew how could still call the
function. Selling is the exception, because that is how stock is supposed
to go down.

**Product pictures.** Uploading puts the file in Supabase Storage and saves
only its web address in the products table. Databases are for small facts;
files belong in a file store. Pictures show on the till buttons and in the
product list.

**Charts.** `BarChart.jsx` is about forty lines of plain divs. Each bar's
height is a percentage of the biggest value. We did not add a chart
library, because a bar chart is genuinely this simple and you can explain
every line of it.

**QR payment.** Press QR instead of Cash and a code appears. Two ways to
set it up, both in `.env`: point `VITE_QR_IMAGE` at a photo of your bank's
QR, or fill in your bank account details and the app builds a live code
with the amount already inside.

One honest limitation worth saying out loud in your presentation: the app
cannot tell whether the customer actually paid. It waits for the
shopkeeper to press "Payment received" after seeing it in their own
banking app. Knowing automatically needs a paid arrangement with the bank.


---

## Batches, and why stock is not just a number

Before batches, a product had one number: 24 in stock. That cannot answer a
question a real shop asks daily — *which* 24? The ones from March that
expire next week, or the ones that came yesterday?

So stock is kept in batches instead. One delivery of one product is one
batch, with its own cost and its own expiry date. `products.stock_quantity`
is now added up from the batches rather than typed in, which means the
number on the product can never disagree with the batches behind it.

Selling takes from the batch expiring soonest. Shops call this **FEFO** —
First Expired, First Out. It is exactly what a shopkeeper does by hand when
they move the old milk to the front of the shelf. One sale can cross
several batches: buy 5 when the oldest batch has 2 left, and it takes those
2 plus 3 from the next one.

**How to show it.** Add two batches of the same product with different
expiry dates. Sell more than the first batch holds. Open the Stock page and
look at the batch table — the first one is empty and the second is partly
used. Nobody chose that; the database did.


---

## Clearance on short-dated stock

Food about to go off is worth more sold cheap than thrown away. The till
marks it down by itself:

| Days until it expires | Off the price |
|---|---|
| 14 or fewer | 50% |
| 7 or fewer | 75% |

The steps live in a `clearance_rules` table, so changing the numbers is an
update statement rather than a code change. Products near their date show an amber badge on the till,
and adding one to the cart applies the discount straight away — the cashier
cannot forget, and nobody has to remember the rule.

It is still an ordinary line discount underneath, so it can be changed or
taken off like any other, and it shows up in the discount totals on the
Reports page.

Already-expired stock gets no discount. It should be written off on the
Stock page, not sold.
