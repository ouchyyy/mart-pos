// ============================================================
// Staff.jsx — see who works here and change what they can do
//
// New accounts are made in the Supabase dashboard, because
// creating a login needs a secret key that must never be put
// inside a website's code.
// ============================================================

import { useState, useEffect } from 'react';
import { getStaff, changeStaffRole } from '../database';
import { shortDate } from '../money';

export default function Staff({ user }) {
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setStaff(await getStaff());
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRoleChange(person, newRole) {
    try {
      await changeStaffRole(person.id, newRole);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Staff</h1>

      {error && <div className="error">{error}</div>}

      <div className="box" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr key={person.id}>
                <td>
                  {person.full_name || 'No name yet'}
                  {person.id === user.id && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      you
                    </span>
                  )}
                </td>
                <td>
                  {/* You cannot change your own role, or you might
                      lock yourself out of the admin pages. */}
                  {person.id === user.id ? (
                    <span className="tag">{person.role}</span>
                  ) : (
                    <select
                      value={person.role}
                      onChange={(e) => handleRoleChange(person, e.target.value)}
                      style={{ width: 130 }}
                    >
                      <option value="cashier">cashier</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
                <td className="small-text grey">{shortDate(person.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
