// SupervisorsPage — who can edit. Only supervisors who manage the list can
// add people or turn access off. There is no approval step.
import { useCallback, useEffect, useId, useState } from 'react';
import { useEditing } from './context';

export default function SupervisorsPage() {
  const { service, user, canManage, checked } = useEditing();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', canManageSupervisors: false });
  const [message, setMessage] = useState(null);
  const ids = { name: useId(), email: useId() };

  const load = useCallback(() => service.listSupervisors(user).then(setList), [service, user]);

  useEffect(() => {
    if (!canManage) return;
    load().catch(() => setList([]));
  }, [canManage, load]);

  if (!checked) return <p>Checking your access…</p>;
  if (!canManage) {
    return <section className="notice-panel"><h1>Supervisors</h1><p>Only supervisors who manage the list can see this page.</p></section>;
  }

  const saveRec = async (rec, success) => {
    try {
      await service.saveSupervisor(user, rec);
      setMessage({ tone: 'ok', text: success });
      await load();
      return true;
    } catch (e) {
      setMessage({ tone: 'error', text: e.message });
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (await saveRec({ ...form, active: true }, `${form.name || form.email} can now edit.`)) {
      setForm({ name: '', email: '', canManageSupervisors: false });
    }
  };

  return (
    <div className="edit-page">
      <header className="edit-header">
        <h1>Supervisors</h1>
        <p className="muted">People on this list can edit and publish guidance after signing in with their work email.</p>
      </header>
      {message && <p className={`form-message form-message--${message.tone}`} role="status">{message.text}</p>}
      <table className="facility-table supervisors-table">
        <thead>
          <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Access</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
        </thead>
        <tbody>
          {(list || []).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <tr key={s.email}>
              <th scope="row">{s.name}</th>
              <td>{s.email}</td>
              <td>{s.active ? (s.canManageSupervisors ? 'Can edit and manage this list' : 'Can edit') : 'Access turned off'}</td>
              <td>
                {s.active ? (
                  <button type="button" className="link-button" onClick={() => saveRec({ ...s, active: false }, `${s.name} can no longer edit.`)}>
                    Turn off access
                  </button>
                ) : (
                  <button type="button" className="link-button" onClick={() => saveRec({ ...s, active: true }, `${s.name} can edit again.`)}>
                    Turn access back on
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="edit-section edit-form" onSubmit={add} aria-labelledby="add-sup">
        <h2 id="add-sup">Add a supervisor</h2>
        <div className="field">
          <label htmlFor={ids.name}>Name</label>
          <input id={ids.name} type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={ids.email}>Work email</label>
          <input id={ids.email} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <label className="radio-line">
          <input type="checkbox" checked={form.canManageSupervisors} onChange={(e) => setForm({ ...form, canManageSupervisors: e.target.checked })} />
          Can also manage this list
        </label>
        <div className="action-row"><button type="submit" className="button-primary">Add supervisor</button></div>
      </form>
    </div>
  );
}
