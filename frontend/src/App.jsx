// ============================================================
// App.jsx
//
// This decides what the person sees:
//   not signed in  -> the login page
//   signed in      -> the menu plus whichever page they picked
//
// We keep the current page in a simple piece of state called
// "page" instead of using a router library. For six pages that
// is easier to follow.
// ============================================================

import { useState, useEffect } from 'react';
import { getMyProfile, signOut } from './database';

import Login from './pages/Login';
import Sell from './pages/Sell';
import Products from './pages/Products';
import Stock from './pages/Stock';
import Movements from './pages/Movements';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Staff from './pages/Staff';
import CustomerScreen from './pages/CustomerScreen';

export default function App() {
  const [user, setUser] = useState(null);
  // Cashiers land on the till. Admins land on the reports,
  // because they do not have a till to open.
  const [page, setPage] = useState('sell');
  const [loading, setLoading] = useState(true);

  // When the app opens, check whether someone is already signed in.
  useEffect(() => {
    getMyProfile()
      .then((profile) => {
        setUser(profile);

        if (profile && profile.role === 'admin') {
          setPage('reports');
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setPage('sell');
  }

  // The customer display is opened at ?customer=1 in its own
  // window. It comes before the sign-in check on purpose: it is a
  // screen facing a customer, not a person using the system.
  if (window.location.search.includes('customer')) {
    return <CustomerScreen />;
  }

  if (loading) {
    return <div className="empty">Loading...</div>;
  }

  if (!user) {
    return (
      <Login
        onSignedIn={(profile) => {
          setUser(profile);
          setPage(profile.role === 'admin' ? 'reports' : 'sell');
        }}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="app">
      <div className="menu">
        <h2>Mart POS</h2>

        {/* Only cashiers work the till. An admin who needs to
            sell something signs in with a cashier account. */}
        {!isAdmin && (
          <MenuButton name="sell" label="Sell" page={page} setPage={setPage} />
        )}

        <MenuButton name="sales" label="Sales" page={page} setPage={setPage} />

        {/* Only admins get the rest. Cashiers never change stock by
            hand — selling something takes it away by itself. */}
        {isAdmin && (
          <>
            <MenuButton name="stock" label="Stock" page={page} setPage={setPage} />
            <MenuButton name="movements" label="Movements" page={page} setPage={setPage} />
            <MenuButton name="products" label="Products" page={page} setPage={setPage} />
            <MenuButton name="reports" label="Reports" page={page} setPage={setPage} />
            <MenuButton name="staff" label="Staff" page={page} setPage={setPage} />
          </>
        )}

        <div className="bottom">
          <div>{user.full_name || 'Staff'}</div>
          <div className="grey">{user.role}</div>
          <button onClick={handleSignOut} style={{ padding: '8px 0' }}>
            Sign out
          </button>
        </div>
      </div>

      <div className={page === 'sell' && !isAdmin ? '' : 'page'} style={{ flex: 1 }}>
        {page === 'sell' && !isAdmin && <Sell />}
        {page === 'sales' && <Sales user={user} />}

        {/* Checked again here, not just on the menu, so an admin
            page can never be shown to a cashier by accident. */}
        {isAdmin && page === 'stock' && <Stock />}
        {isAdmin && page === 'movements' && <Movements />}
        {isAdmin && page === 'products' && <Products />}
        {isAdmin && page === 'reports' && <Reports />}
        {isAdmin && page === 'staff' && <Staff user={user} />}
      </div>
    </div>
  );
}

// One menu button. It highlights itself when it is the open page.
function MenuButton({ name, label, page, setPage }) {
  return (
    <button
      className={page === name ? 'active' : ''}
      onClick={() => setPage(name)}
    >
      {label}
    </button>
  );
}
