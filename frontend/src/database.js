// ============================================================
// database.js
//
// Every conversation with the database happens in this file.
// The pages call these functions and never talk to Supabase
// directly, so if data looks wrong, this is the file to open.
// ============================================================

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Supabase gives back { data, error } instead of throwing an error.
// This little helper throws instead, so our pages can use try/catch.
function check(result) {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

// Staff type a username like "admin", but Supabase needs an email.
// So we add a fake domain onto the end. No email is ever sent.
function makeEmail(username) {
  if (username.includes('@')) {
    return username;
  }
  return username + '@mart.local';
}

// ------------------------------------------------------------
// Signing in and out
// ------------------------------------------------------------

export async function signIn(username, password) {
  const result = await supabase.auth.signInWithPassword({
    email: makeEmail(username),
    password: password,
  });

  if (result.error) {
    throw new Error('Wrong username or password');
  }

  return getMyProfile();
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Returns the signed-in person, or null if nobody is signed in.
export async function getMyProfile() {
  const session = await supabase.auth.getSession();

  if (!session.data.session) {
    return null;
  }

  const myId = session.data.session.user.id;

  return check(
    await supabase.from('profiles').select('*').eq('id', myId).single()
  );
}

// ------------------------------------------------------------
// Products
// ------------------------------------------------------------

// Reads products_for_sale, not products. The view adds three
// things the database works out: the category name, how much off
// this product is today, and what that makes the price. Nothing
// in the app calculates a discount for itself, so no two screens
// can disagree about what something costs.
export async function getProducts(search) {
  let query = supabase
    .from('products_for_sale')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (search) {
    query = query.or('name.ilike.%' + search + '%,barcode.eq.' + search);
  }

  return check(await query);
}

export async function getProductByBarcode(barcode) {
  return check(
    await supabase
      .from('products_for_sale')
      .select('*')
      .eq('barcode', barcode)
      .eq('is_active', true)
      .single()
  );
}

export async function addProduct(product) {
  return check(
    await supabase.from('products').insert(product).select().single()
  );
}

export async function updateProduct(id, product) {
  return check(
    await supabase.from('products').update(product).eq('id', id).select().single()
  );
}

// We do not really delete a product, because it may appear in old
// sales. We just hide it from the shop.
export async function hideProduct(id) {
  return check(
    await supabase.from('products').update({ is_active: false }).eq('id', id)
  );
}

// ------------------------------------------------------------
// Product pictures
//
// The picture itself goes into Supabase Storage. We only keep
// its web address in the products table.
// ------------------------------------------------------------

export async function uploadPicture(file) {
  // Give the file a name that cannot clash with another one.
  const ending = file.name.split('.').pop();
  const fileName = Date.now() + '-' + Math.round(Math.random() * 10000) + '.' + ending;

  const upload = await supabase.storage.from('products').upload(fileName, file);

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  // Ask Supabase for the address the browser can use.
  const result = supabase.storage.from('products').getPublicUrl(fileName);

  return result.data.publicUrl;
}

export async function getCategories() {
  return check(await supabase.from('categories').select('*').order('name'));
}

export async function addCategory(name) {
  return check(
    await supabase.from('categories').insert({ name: name }).select().single()
  );
}

export async function renameCategory(id, name) {
  return check(
    await supabase.from('categories').update({ name: name }).eq('id', id)
  );
}

// A category is only removed if no product is using it, otherwise
// those products would lose their group without anyone noticing.
export async function deleteCategory(id) {
  const inUse = check(
    await supabase.from('products').select('id').eq('category_id', id).limit(1)
  );

  if (inUse.length > 0) {
    throw new Error('Some products are still in this category');
  }

  return check(await supabase.from('categories').delete().eq('id', id));
}

// ------------------------------------------------------------
// Stock
// ------------------------------------------------------------

// Stock coming IN. This always makes a new batch, which is what
// keeps a delivery that expires in June separate from one that
// expires in December.
export async function addBatch(productId, quantity, details) {
  return check(
    await supabase.rpc('add_batch', {
      the_product_id: productId,
      how_many: quantity,
      the_cost: Number(details.cost) || 0,
      the_expiry: details.expiry || null,
      the_batch_no: details.batchNo || null,
      the_reason: details.reason || 'restock',
      the_note: details.note || null,
    })
  );
}

// Stock going OUT. The database decides which batches to take
// from — the ones expiring soonest go first.
export async function takeStock(productId, quantity, reason, note) {
  return check(
    await supabase.rpc('take_stock', {
      the_product_id: productId,
      how_many: quantity,
      the_reason: reason,
      the_note: note || null,
    })
  );
}

// The batches a product still has, soonest to expire first.
export async function getBatches(productId) {
  return check(
    await supabase
      .from('product_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('quantity_left', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('received_at')
  );
}

export async function getStockHistory(productId) {
  let query = supabase
    .from('stock_movements')
    .select('*, products(name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  return check(await query);
}

// ------------------------------------------------------------
// Sales
// ------------------------------------------------------------

// cart is a list like [{ product_id: 3, quantity: 2 }]
// paymentMethod is 'cash' or 'qr'
// discount is money off the whole sale, in dollars
export async function saveSale(cart, moneyReceived, paymentMethod, discount) {
  const saleId = check(
    await supabase.rpc('save_sale', {
      cart: cart,
      money_received: moneyReceived,
      how_they_paid: paymentMethod || 'cash',
      the_discount: Number(discount) || 0,
    })
  );

  return getSale(saleId);
}

export async function getSale(id) {
  return check(
    await supabase
      .from('sales')
      .select('*, sale_items(*), profiles(full_name)')
      .eq('id', id)
      .single()
  );
}

export async function getSales(fromDate, toDate) {
  let query = supabase
    .from('sales')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (fromDate) {
    query = query.gte('created_at', fromDate);
  }
  if (toDate) {
    // Add the time so the whole last day is included.
    query = query.lte('created_at', toDate + 'T23:59:59');
  }

  return check(await query);
}

export async function cancelSale(id, reason) {
  return check(
    await supabase.rpc('cancel_sale', {
      the_sale_id: id,
      the_reason: reason,
    })
  );
}

// ------------------------------------------------------------
// Reports
//
// We ask the database for the rows and add them up here in the
// browser. A small shop does not have enough sales for this to
// be slow, and it is much easier to read than a big SQL query.
// ------------------------------------------------------------

// Completed sales since a date. Used by the report cards, which
// change what they cover when you pick a different period.
export async function getSalesSince(fromDate) {
  return check(
    await supabase
      .from('sales')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', fromDate)
  );
}

export async function getBestSellers(fromDate) {
  const rows = check(
    await supabase
      .from('sale_items')
      .select('product_name, quantity, line_total, sales!inner(created_at, status)')
      .eq('sales.status', 'completed')
      .gte('sales.created_at', fromDate)
  );

  // Add up the rows for each product name.
  const totals = {};

  for (const row of rows) {
    if (!totals[row.product_name]) {
      totals[row.product_name] = { name: row.product_name, sold: 0, money: 0 };
    }
    totals[row.product_name].sold += row.quantity;
    totals[row.product_name].money += Number(row.line_total);
  }

  // Turn it back into a list, biggest first.
  const list = Object.values(totals);
  list.sort((a, b) => b.sold - a.sold);

  return list;
}

// What sold, grouped by category.
//
// We ask for the rows and group them here rather than writing a
// clever SQL query, because a small shop does not have enough
// sales for it to matter and this is much easier to follow.
export async function getSalesByCategory(fromDate) {
  const rows = check(
    await supabase
      .from('sale_items')
      .select(
        'quantity, line_total, products(categories(name)), sales!inner(created_at, status)'
      )
      .eq('sales.status', 'completed')
      .gte('sales.created_at', fromDate)
  );

  const totals = {};

  for (const row of rows) {
    // A product might have no category, and it still sold.
    const category =
      row.products && row.products.categories
        ? row.products.categories.name
        : 'No category';

    if (!totals[category]) {
      totals[category] = { name: category, sold: 0, money: 0 };
    }

    totals[category].sold += row.quantity;
    totals[category].money += Number(row.line_total);
  }

  const list = Object.values(totals);
  list.sort((a, b) => b.money - a.money);

  return list;
}

// How busy each hour of the day is, added up over the period.
//
// This is the one that changes how a shop is run: it says when to
// have two people on the till and when one is enough.
export async function getBusiestHours(fromDate) {
  const sales = check(
    await supabase
      .from('sales')
      .select('total, created_at')
      .eq('status', 'completed')
      .gte('created_at', fromDate)
  );

  // Start with every hour at zero, so quiet hours still appear
  // as gaps rather than vanishing from the chart.
  const hours = [];

  for (let hour = 0; hour < 24; hour++) {
    hours.push({ hour: hour, sales: 0, money: 0 });
  }

  for (const sale of sales) {
    const hour = new Date(sale.created_at).getHours();
    hours[hour].sales += 1;
    hours[hour].money += Number(sale.total);
  }

  return hours;
}

// Cash or QR, and how much through each.
export async function getPaymentSplit(fromDate) {
  const sales = check(
    await supabase
      .from('sales')
      .select('total, payment_method')
      .eq('status', 'completed')
      .gte('created_at', fromDate)
  );

  const totals = {};

  for (const sale of sales) {
    const how = sale.payment_method || 'cash';

    if (!totals[how]) {
      totals[how] = { name: how, sold: 0, money: 0 };
    }

    totals[how].sold += 1;
    totals[how].money += Number(sale.total);
  }

  return Object.values(totals);
}

export async function getLowStock() {
  const products = check(
    await supabase
      .from('products_for_sale')
      .select('*')
      .eq('is_active', true)
      .order('stock_quantity')
  );

  // Postgres cannot easily compare two columns through this API,
  // so we filter here instead.
  return products.filter((p) => p.stock_quantity <= p.low_stock_at);
}

// Products getting close to their expiry date.
//
// Each product decides for itself how much notice it needs, so
// we ask for everything with a date and compare here. Milk with
// three days' notice and tinned fish with thirty both appear at
// the right moment, instead of one fixed number suiting neither.
export async function getExpiringSoon() {
  const products = check(
    await supabase
      .from('products_for_sale')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .not('expiry_date', 'is', null)
      .order('expiry_date')
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return products.filter((product) => {
    const expires = new Date(product.expiry_date);
    const oneDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.round((expires - today) / oneDay);

    return daysLeft <= product.expiry_warn_days;
  });
}

export async function getStaff() {
  return check(await supabase.from('profiles').select('*').order('full_name'));
}

export async function changeStaffRole(id, role) {
  return check(
    await supabase.from('profiles').update({ role: role }).eq('id', id)
  );
}
