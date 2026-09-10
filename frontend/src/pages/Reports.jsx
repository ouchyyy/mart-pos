// ============================================================
// Reports.jsx — how the shop is doing
//
// Four numbers at the top for today, then charts covering the
// last 30 days, then the warnings that need acting on.
// ============================================================

import { useState, useEffect } from 'react';
import {
  getTodaysSales,
  getBestSellers,
  getSalesByCategory,
  getBusiestHours,
  getPaymentSplit,
  getLowStock,
  getExpiringSoon,
} from '../database';
import { money, shortDate, daysUntil } from '../money';

import RankChart from '../components/RankChart';
import DonutChart from '../components/DonutChart';
import HoursChart from '../components/HoursChart';

export default function Reports() {
  const [todaysSales, setTodaysSales] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byHour, setByHour] = useState([]);
  const [payments, setPayments] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      // Everything below the top row covers the last 30 days.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      setTodaysSales(await getTodaysSales());
      setBestSellers(await getBestSellers(since));
      setByCategory(await getSalesByCategory(since));
      setByHour(await getBusiestHours(since));
      setPayments(await getPaymentSplit(since));
      setLowStock(await getLowStock());
      setExpiring(await getExpiringSoon());
    } catch (err) {
      setError(err.message);
    }
  }

  // Add up today.
  let takings = 0;
  let givenAway = 0;

  for (const sale of todaysSales) {
    takings = takings + Number(sale.total);
    givenAway =
      givenAway + Number(sale.discount || 0) + Number(sale.item_discount || 0);
  }

  const average = todaysSales.length > 0 ? takings / todaysSales.length : 0;

  return (
    <div>
      <h1>Reports</h1>

      {error && <div className="error">{error}</div>}

      <div className="cards">
        <div className="card">
          <div className="label">Today's takings</div>
          <div className="value number">{money(takings)}</div>
        </div>
        <div className="card">
          <div className="label">Sales today</div>
          <div className="value number">{todaysSales.length}</div>
        </div>
        <div className="card">
          <div className="label">Average sale</div>
          <div className="value number">{money(average)}</div>
        </div>
        <div className="card">
          <div className="label">Discounts today</div>
          <div
            className="value number"
            style={{ color: givenAway > 0 ? 'var(--red)' : '' }}
          >
            {money(givenAway)}
          </div>
        </div>
      </div>

      <div className="side-by-side">
        <div className="box">
          <h2>Sales by category</h2>
          <p className="chart-note">Last 30 days</p>
          <DonutChart
            slices={byCategory.map((row) => ({
              name: row.name,
              money: row.money,
            }))}
          />
        </div>

        <div className="box">
          <h2>Best sellers</h2>
          <p className="chart-note">Last 30 days</p>
          <RankChart
            rows={bestSellers.slice(0, 7).map((row) => ({
              label: row.name,
              amount: row.money,
              extra: row.sold + ' sold',
            }))}
          />
        </div>
      </div>

      <div className="box" style={{ marginTop: 20 }}>
        <h2>Busiest times of day</h2>
        <p className="chart-note">
          Last 30 days. This is the one that changes how the shop is run —
          it says when two people are needed on the till.
        </p>
        <HoursChart hours={byHour} />
      </div>

      {payments.length > 0 && (
        <div className="box" style={{ marginTop: 20 }}>
          <h2>How customers paid</h2>
          <p className="chart-note">Last 30 days</p>
          <DonutChart
            slices={payments.map((row) => ({
              name: row.name === 'qr' ? 'QR code' : 'Cash',
              money: row.money,
            }))}
          />
        </div>
      )}

      <div className="side-by-side" style={{ marginTop: 20 }}>
        <div className="box" style={{ padding: 0 }}>
          <h2 style={{ padding: '16px 18px 0' }}>Running low</h2>
          <table>
            <tbody>
              {lowStock.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td className="right">
                    <span
                      className={
                        product.stock_quantity === 0
                          ? 'tag out number'
                          : 'tag warning number'
                      }
                    >
                      {product.stock_quantity === 0
                        ? 'out'
                        : product.stock_quantity + ' left'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lowStock.length === 0 && (
            <div className="empty small-text">Everything is stocked up.</div>
          )}
        </div>

        <div className="box" style={{ padding: 0 }}>
          <h2 style={{ padding: '16px 18px 0' }}>Expiring soon</h2>
          <p className="chart-note" style={{ padding: '0 18px' }}>
            Marked down automatically: 50% off inside 14 days, 75% inside 7.
          </p>
          <table>
            <tbody>
              {expiring.map((product) => {
                const days = daysUntil(product.expiry_date);

                return (
                  <tr key={product.id}>
                    <td>
                      {product.name}
                      <div className="grey small-text">
                        {shortDate(product.expiry_date)}
                      </div>
                    </td>
                    <td className="right">
                      {product.clearance_percent > 0 && (
                        <div className="clearance-price number">
                          {money(product.price_today)}
                          <span className="was"> {money(product.selling_price)}</span>
                        </div>
                      )}
                      <span
                        className={days < 0 ? 'tag out' : 'tag warning'}
                      >
                        {days < 0 ? 'expired' : days + ' days'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {expiring.length === 0 && (
            <div className="empty small-text">Nothing expiring soon.</div>
          )}
        </div>
      </div>
    </div>
  );
}
