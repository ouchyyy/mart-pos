// ============================================================
// Movements.jsx — everything that has happened to the stock
//
// The Stock page says what we have. This page says how it got
// that way. Every row here was written by the database, never
// typed in, so it can be trusted as a record.
// ============================================================

import { useState, useEffect } from 'react';
import { getStockHistory } from '../database';
import { dateAndTime } from '../money';

export default function Movements() {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStockHistory()
      .then((rows) => setHistory(rows))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // One search box filters both lists.
  function matchesSearch(row) {
    if (search === '') {
      return true;
    }

    const text = search.toLowerCase();
    const name = row.products ? row.products.name.toLowerCase() : '';

    return name.includes(text) || row.reason.toLowerCase().includes(text);
  }

  // Things somebody did on purpose: deliveries, write-offs,
  // corrections.
  const stockChanges = history.filter(
    (row) => row.reason !== 'sale' && matchesSearch(row)
  );

  // Things that happened by themselves because a customer bought
  // something. Kept apart because there are far more of these,
  // and they would bury the ones above.
  const sales = history.filter(
    (row) => row.reason === 'sale' && matchesSearch(row)
  );

  return (
    <div>
      <h1>Movements</h1>

      {error && <div className="error">{error}</div>}
      {loading && <div className="empty">Loading...</div>}

      <div className="box" style={{ padding: 0, marginBottom: 20 }}>
        <div className="panel-head">
          <h2 style={{ margin: 0 }}>Stock changes</h2>
          <input
            className="search-small"
            placeholder="Search product or reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="scroll-box">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Reason</th>
                <th>By</th>
                <th className="right">Change</th>
                <th className="right">After</th>
              </tr>
            </thead>
            <tbody>
              {stockChanges.map((row) => (
                <tr key={row.id}>
                  <td className="small-text grey">{dateAndTime(row.created_at)}</td>
                  <td>{row.products ? row.products.name : '-'}</td>
                  <td className="small-text">{row.reason}</td>
                  <td className="small-text">
                    {row.profiles ? row.profiles.full_name || 'Unnamed staff' : '-'}
                  </td>
                  <td
                    className="right number"
                    style={{
                      color: row.change < 0 ? 'var(--red)' : 'var(--green)',
                      fontWeight: 600,
                    }}
                  >
                    {row.change > 0 ? '+' : ''}
                    {row.change}
                  </td>
                  <td className="right number">{row.stock_after}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && stockChanges.length === 0 && (
            <div className="empty small-text">
              {search ? 'Nothing matches that search.' : 'Nothing changed yet.'}
            </div>
          )}
        </div>
      </div>

      <div className="box" style={{ padding: 0 }}>
        <div className="panel-head">
          <h2 style={{ margin: 0 }}>Sold at the till</h2>
          <span className="grey small-text">
            {sales.length} {sales.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="scroll-box">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Sold by</th>
                <th className="right">Quantity</th>
                <th className="right">Left</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row.id}>
                  <td className="small-text grey">{dateAndTime(row.created_at)}</td>
                  <td>{row.products ? row.products.name : '-'}</td>
                  <td className="small-text">
                    {row.profiles ? row.profiles.full_name || 'Unnamed staff' : '-'}
                  </td>
                  <td className="right number" style={{ fontWeight: 600 }}>
                    {Math.abs(row.change)}
                  </td>
                  <td className="right number">{row.stock_after}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && sales.length === 0 && (
            <div className="empty small-text">
              {search ? 'Nothing matches that search.' : 'Nothing sold yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
