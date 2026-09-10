// ============================================================
// Sell.jsx — the till
//
// The cashier searches or scans, taps a product to add it to the
// cart, types how much cash the customer gave, and presses Charge.
// ============================================================

import { useState, useEffect } from 'react';
import { getProducts, getCategories, saveSale } from '../database';
import { money, riel } from '../money';
import Receipt from '../components/Receipt';
import QrPayment from '../components/QrPayment';
import { sendToCustomerScreen } from '../cartChannel';

export default function Sell() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [payWith, setPayWith] = useState('cash');
  const [showingQr, setShowingQr] = useState(false);
  const [discount, setDiscount] = useState('');
  const [discountIsPercent, setDiscountIsPercent] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setProducts(await getProducts());
      setCategories(await getCategories());
    } catch (err) {
      setError(err.message);
    }
  }

  // Show only the products that match what was typed.
  // We filter the list we already have instead of asking the
  // database again, so typing feels instant.
  const shownProducts = products.filter((product) => {
    // Two filters, both have to pass. The chips narrow to one
    // shelf; the search box finds one thing.
    const name = product.category_name || 'No category';

    let matchesFilter = true;

    if (filterCategory === 'offers') {
      matchesFilter = product.clearance_percent > 0;
    } else if (filterCategory !== '') {
      matchesFilter = name === filterCategory;
    }

    if (!matchesFilter) {
      return false;
    }

    if (search === '') {
      return true;
    }

    const text = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(text) ||
      (product.barcode || '').includes(search)
    );
  });

  // Group what is on screen by category, keeping the categories
  // in the order they first appear (the list is already sorted by
  // name, so this comes out alphabetical).
  function groupByCategory(list) {
    const groups = [];

    // Everything marked down also gets its own row at the top, so
    // a cashier is nudged to shift the short-dated stock first.
    //
    // "Also" is the point: the product stays on its normal shelf
    // as well. A real shop puts offers on an end-cap without
    // emptying the aisle they came from, and a cashier looking
    // under Snacks for a Kit Kat should find one there.
    const onOffer = list.filter((product) => product.clearance_percent > 0);

    if (onOffer.length > 0) {
      groups.push({ name: 'Discounts', products: onOffer, isOffer: true });
    }

    // Start with every category the shop has, in name order, so
    // the rows stay in the same place all day. If they appeared
    // only when they had stock, the shelves would shuffle around
    // as things sold out — and a cashier who has learned where
    // things are would have to look again.
    for (const category of categories) {
      groups.push({ name: category.name, products: [] });
    }

    groups.push({ name: 'No category', products: [] });

    for (const product of list) {
      const name = product.category_name || 'No category';
      let group = groups.find((g) => g.name === name);

      // A category that was deleted while a product still points
      // at it. Rare, but it should not make the product vanish.
      if (!group) {
        group = { name: name, products: [] };
        groups.push(group);
      }

      group.products.push(product);
    }

    // Drop 'No category' when nothing is in it, since it is not a
    // real shelf. Real categories stay even when empty.
    return groups.filter(
      (group) => group.name !== 'No category' || group.products.length > 0
    );
  }

  function addToCart(product) {
    setError('');

    // Is this product already in the cart?
    const existing = cart.find((row) => row.id === product.id);

    if (existing) {
      if (existing.quantity + 1 > product.stock_quantity) {
        setError('Only ' + product.stock_quantity + ' left of ' + product.name);
        return;
      }
      setCart(
        cart.map((row) =>
          row.id === product.id
            ? { ...row, quantity: row.quantity + 1 }
            : row
        )
      );
      return;
    }

    if (product.stock_quantity < 1) {
      setError(product.name + ' is out of stock');
      return;
    }

    // The database has already worked out whether this is on
    // clearance and by how much. We just apply it, so the cashier
    // cannot forget and nobody has to remember the rule.
    // It stays an ordinary line discount, so it can be changed or
    // removed like any other.
    const markdown = product.clearance_percent || 0;

    setCart([
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: Number(product.selling_price),
        stock: product.stock_quantity,
        quantity: 1,
        discount: markdown > 0 ? String(markdown) : '',
        discountIsPercent: markdown > 0,
        isClearance: markdown > 0,
      },
    ]);
  }

  // Money off one line. Kept as text while typing so the box can
  // be empty, and turned into a number only when we add up.
  function changeLineDiscount(id, value) {
    setCart(
      cart.map((row) => (row.id === id ? { ...row, discount: value } : row))
    );
  }

  function toggleLineDiscountKind(id) {
    setCart(
      cart.map((row) =>
        row.id === id
          ? { ...row, discountIsPercent: !row.discountIsPercent }
          : row
      )
    );
  }

  // How much comes off one line in total.
  //
  // A money discount is per item, not per line. "Take 50c off the
  // bread" means 50c off each loaf, so buying two saves a dollar.
  // That is what a shopkeeper means when they say it, and it also
  // means the saving does not quietly shrink as you buy more.
  //
  // A percentage needs no multiplying — a tenth of the line is a
  // tenth however many there are.
  function lineDiscountOf(row) {
    const typed = Number(row.discount) || 0;

    if (typed <= 0) {
      return 0;
    }

    const before = row.price * row.quantity;

    const off = row.discountIsPercent
      ? (before * typed) / 100
      : typed * row.quantity;

    // Never give away more than the line is worth.
    return Math.min(off, before);
  }

  // What one line costs after its own discount.
  function lineTotal(row) {
    return row.price * row.quantity - lineDiscountOf(row);
  }

  function changeQuantity(id, amount) {
    const updated = [];

    for (const row of cart) {
      if (row.id !== id) {
        updated.push(row);
        continue;
      }

      const newQuantity = row.quantity + amount;

      if (newQuantity > row.stock) {
        setError('Only ' + row.stock + ' left of ' + row.name);
        updated.push(row);
      } else if (newQuantity > 0) {
        updated.push({ ...row, quantity: newQuantity });
      }
      // If it drops to zero we simply do not add it back,
      // which removes it from the cart.
    }

    setCart(updated);
  }

  // A barcode scanner types the numbers and then presses Enter.
  function handleSearchKey(event) {
    if (event.key !== 'Enter') {
      return;
    }

    const found = products.find((p) => p.barcode === search.trim());

    if (found) {
      addToCart(found);
      setSearch('');
    } else if (shownProducts.length === 1) {
      addToCart(shownProducts[0]);
      setSearch('');
    } else {
      setError('No product with barcode ' + search);
    }
  }

  // Add up the cart before any discount at all.
  let subtotal = 0;
  for (const row of cart) {
    subtotal = subtotal + row.price * row.quantity;
  }

  // Then take off the discounts given on single lines.
  let itemDiscounts = 0;
  for (const row of cart) {
    itemDiscounts = itemDiscounts + lineDiscountOf(row);
  }

  const afterItemDiscounts = subtotal - itemDiscounts;

  // The discount box can hold either dollars or a percentage.
  // Whichever it is, we work out the dollars here, because that
  // is what the database stores.
  let discountAmount = 0;

  // The percentage is worked out on what is left AFTER the line
  // discounts, never on the original price. Otherwise 10% off
  // could come to more than the customer is actually paying.
  if (Number(discount) > 0) {
    if (discountIsPercent) {
      discountAmount = (afterItemDiscounts * Number(discount)) / 100;
    } else {
      discountAmount = Number(discount);
    }
  }

  // Never let a discount make the total negative.
  if (discountAmount > afterItemDiscounts) {
    discountAmount = afterItemDiscounts;
  }

  const total = afterItemDiscounts - discountAmount;
  const change = Number(cashGiven) - total;
  const payingCash = payWith === 'cash';

  // With cash we need enough money. With QR the customer pays
  // the exact amount, so there is nothing to check.
  // Tell the customer screen about anything it shows. Runs after
  // every change, which is cheap — it is one message between two
  // windows, not a trip to the database.
  useEffect(() => {
    sendToCustomerScreen({
      items: cart.map((row) => ({
        name: row.name,
        price: row.price,
        quantity: row.quantity,
        discount: lineDiscountOf(row),
        lineTotal: lineTotal(row),
      })),
      subtotal: subtotal,
      itemDiscounts: itemDiscounts,
      discount: discountAmount,
      total: total,
      showQr: showingQr,
    });
  }, [cart, discount, discountIsPercent, showingQr]);

  const canCharge =
    cart.length > 0 && !busy && (!payingCash || Number(cashGiven) >= total);

  // Pressing Charge shows the QR first when paying by QR.
  // The sale is only saved after the shopkeeper confirms.
  function handleCharge() {
    if (payingCash) {
      saveTheSale(total);
    } else {
      setShowingQr(true);
    }
  }

  async function saveTheSale(amountPaid) {
    setError('');
    setBusy(true);
    setShowingQr(false);

    try {
      // Turn the cart into the simple list the database wants.
      const list = cart.map((row) => ({
        product_id: row.id,
        quantity: row.quantity,
        // The database stores money off the line, so we send the
        // worked-out amount rather than "10%" or "50c each".
        discount: lineDiscountOf(row),
      }));

      const sale = await saveSale(list, amountPaid, payWith, discountAmount);

      setReceipt(sale);
      setCart([]);
      setCashGiven('');
      setDiscount('');
      loadProducts(); // the stock numbers have changed
    } catch (err) {
      setError(err.message);
    }

    setBusy(false);
  }

  return (
    <div className="sell">
      <div className="sell-left">
        <input
          className="search-box"
          placeholder="Scan a barcode or type a product name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKey}
          autoFocus
        />

        {/* Filter chips rather than a dropdown: at a till every
            extra tap costs time, and a dropdown hides the choices
            until you open it. */}
        <div className="filter-chips">
          <button
            className={filterCategory === '' ? 'chip on' : 'chip'}
            onClick={() => setFilterCategory('')}
          >
            All
          </button>

          {products.some((product) => product.clearance_percent > 0) && (
            <button
              className={filterCategory === 'offers' ? 'chip offers on' : 'chip offers'}
              onClick={() => setFilterCategory('offers')}
            >
              Discounts
            </button>
          )}

          {categories.map((category) => (
            <button
              key={category.id}
              className={filterCategory === category.name ? 'chip on' : 'chip'}
              onClick={() => setFilterCategory(category.name)}
            >
              {category.name}
            </button>
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        {shownProducts.length === 0 && (
          <div className="empty">No products match "{search}"</div>
        )}

        {/* While searching, one flat list is what you want — the
            categories only get in the way of finding one thing. */}
        {shownProducts.length > 0 && (search !== '' || filterCategory !== '') && (
          <div className="product-grid">
            {shownProducts.map((product) => (
              <button
                key={product.id}
                className="product-button"
                onClick={() => addToCart(product)}
                disabled={product.stock_quantity < 1}
              >
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="product-photo" />
                ) : (
                  <div className="product-photo-missing">?</div>
                )}

                <div className="name">{product.name}</div>

                {product.clearance_percent > 0 && (
                  <div className="clearance-badge">
                    {product.clearance_percent}% off ·{' '}
                    {product.days_to_expiry === 0
                      ? 'today'
                      : product.days_to_expiry + ' days left'}
                  </div>
                )}
                <div className="price-row">
                  <strong className="number">{money(product.selling_price)}</strong>
                  <span
                    className={
                      product.stock_quantity <= product.low_stock_at
                        ? 'stock low number'
                        : 'stock number'
                    }
                  >
                    {product.stock_quantity < 1
                      ? 'Out'
                      : product.stock_quantity + ' left'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Not searching: one row per category, each scrolling
            sideways. A shopkeeper knows which shelf a thing is on
            long before they know its name, so grouping matches how
            they already think about the shop. */}
        {shownProducts.length > 0 &&
          search === '' &&
          filterCategory === '' &&
          groupByCategory(shownProducts).map((group) => (
            <div className="category-row" key={group.name}>
              <div
                className={
                  group.isOffer ? 'category-heading offer' : 'category-heading'
                }
              >
                {group.name}
              </div>

              <div className="product-grid">
                {group.products.length === 0 && (
                  <div className="category-empty">Nothing in stock</div>
                )}

                {group.products.map((product) => (
                  <button
                    key={product.id}
                    className="product-button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock_quantity < 1}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="product-photo" />
                    ) : (
                      <div className="product-photo-missing">?</div>
                    )}

                    <div className="name">{product.name}</div>

                    {product.clearance_percent > 0 && (
                      <div className="clearance-badge">
                        {product.clearance_percent}% off ·{' '}
                        {product.days_to_expiry === 0
                          ? 'today'
                          : product.days_to_expiry + ' days left'}
                      </div>
                    )}

                    <div className="price-row">
                      <strong className="number">
                        {money(product.selling_price)}
                      </strong>
                      <span
                        className={
                          product.stock_quantity <= product.low_stock_at
                            ? 'stock low number'
                            : 'stock number'
                        }
                      >
                        {product.stock_quantity < 1
                          ? 'Out'
                          : product.stock_quantity + ' left'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="sell-right">
        <div className="cart-title">
          <h2 style={{ margin: 0 }}>Cart</h2>

          {/* Opens the customer display in its own window, ready
              to drag onto a second monitor. */}
          <button
            className="small"
            title="Open the screen that faces the customer"
            onClick={() =>
              window.open('?customer=1', 'customer-screen', 'width=900,height=700')
            }
          >
            Customer screen
          </button>

          {cart.length > 0 && (
            <button className="danger small" onClick={() => setCart([])}>
              Clear
            </button>
          )}
        </div>

        <div className="cart-list">
          {cart.length === 0 ? (
            <div className="empty small-text">Scan an item to start</div>
          ) : (
            cart.map((row) => {
              const before = row.price * row.quantity;
              const off = lineDiscountOf(row);

              return (
                <div key={row.id} className="cart-row">
                  {/* top line: the name and what this line comes to */}
                  <div className="cart-line-top">
                    <div>
                      <div>{row.name}</div>
                      <div className="grey small-text number">
                        {money(row.price)} each
                      </div>
                      {row.isClearance && (
                        <div className="clearance-note">near expiry</div>
                      )}
                    </div>

                    <div className="cart-line-money">
                      {off > 0 && (
                        <>
                          <div className="was number">{money(before)}</div>
                          <div className="off number">-{money(off)}</div>
                        </>
                      )}
                      <strong className="number">{money(lineTotal(row))}</strong>
                    </div>
                  </div>

                  {/* bottom line: how many, and money off this item */}
                  <div className="cart-line-bottom">
                    <div className="quantity">
                      <button className="small" onClick={() => changeQuantity(row.id, -1)}>
                        &minus;
                      </button>
                      <span className="number">{row.quantity}</span>
                      <button className="small" onClick={() => changeQuantity(row.id, 1)}>
                        +
                      </button>
                    </div>

                    <div className="line-discount">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="number"
                        placeholder="0"
                        value={row.discount}
                        onChange={(e) => changeLineDiscount(row.id, e.target.value)}
                      />

                      {/* One button that swaps between the two, rather
                          than two buttons taking up the room. */}
                      <button
                        className="kind"
                        onClick={() => toggleLineDiscountKind(row.id)}
                        title={
                          row.discountIsPercent
                            ? 'Percent off this line'
                            : 'Money off each one'
                        }
                      >
                        {row.discountIsPercent ? '%' : '$ each'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* The discount sits just above the total, so the cashier
            sees the number change as they type. */}
        {cart.length > 0 && (
          <div className="discount-row">
            <span>Discount</span>

            <div className="discount-input">
              <input
                type="number"
                min="0"
                step="0.01"
                className="number"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />

              <button
                className={discountIsPercent ? '' : 'chosen'}
                onClick={() => setDiscountIsPercent(false)}
                title="Money off"
              >
                $
              </button>
              <button
                className={discountIsPercent ? 'chosen' : ''}
                onClick={() => setDiscountIsPercent(true)}
                title="Percent off"
              >
                %
              </button>
            </div>
          </div>
        )}

        {(itemDiscounts > 0 || discountAmount > 0) && (
          <div className="subtotal-row">
            <div>
              <span>Subtotal</span>
              <span className="number">{money(subtotal)}</span>
            </div>
            {itemDiscounts > 0 && (
              <div className="discount-line">
                <span>Item discounts</span>
                <span className="number">-{money(itemDiscounts)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="discount-line">
                <span>Sale discount</span>
                <span className="number">-{money(discountAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Prices are kept in dollars, but most customers here pay
            and take change in riel. Both are shown at the same size
            because neither is the "real" one — whichever the
            customer is holding is the one that matters. */}
        <div className="total-bar">
          <strong>Total</strong>
          <div className="total-amounts">
            <span className="amount number">{money(total)}</span>
            <span className="amount number">{riel(total)}</span>
          </div>
        </div>

        <div className="payment">
          <div className="pay-choice">
            <button
              className={payingCash ? 'chosen' : ''}
              onClick={() => setPayWith('cash')}
            >
              Cash
            </button>
            <button
              className={!payingCash ? 'chosen' : ''}
              onClick={() => setPayWith('qr')}
            >
              QR code
            </button>
          </div>

          {payingCash && (
            <>
              <label>
                <span>Cash received</span>
                <input
                  type="number"
                  step="0.01"
                  className="number"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                />
              </label>

              <div className="change-row">
                <span>Change</span>
                <div className="change-amounts">
                  <span className="number">{money(change > 0 ? change : 0)}</span>
                  <span className="number">{riel(change > 0 ? change : 0)}</span>
                </div>
              </div>
            </>
          )}

          <button className="primary big" onClick={handleCharge} disabled={!canCharge}>
            {busy ? 'Saving...' : 'Charge ' + money(total)}
          </button>
        </div>
      </div>

      {showingQr && (
        <QrPayment
          amount={total}
          onPaid={() => saveTheSale(total)}
          onCancel={() => setShowingQr(false)}
        />
      )}

      {receipt && (
        <Receipt sale={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
