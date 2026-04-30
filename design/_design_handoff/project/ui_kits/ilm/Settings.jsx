/* global React */
const { useState: useStateS } = React;

function SettingsView({ onOpenLabPicker }) {
  const [name, setName] = useStateS("Anika Mendez");
  const [email] = useStateS("anika@rhinelab.bio");
  const [labName, setLabName] = useStateS("Rhine Lab L.L.C.");
  const [labDesc, setLabDesc] = useStateS("Computational biology, sequencing, and CRISPR work.");
  return (
    <div className="set-grid">
      <div className="set-card">
        <h3>PROFILE</h3>
        <p className="help">Your name and avatar appear across the lab.</p>
        <div className="set-row">
          <label className="ilm-auth-field"><span>Display name</span><input value={name} onChange={(e)=>setName(e.target.value)} /></label>
          <label className="ilm-auth-field"><span>Email</span><input value={email} disabled /></label>
        </div>
        <div className="set-actions">
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Save profile</button>
        </div>
      </div>
      <div className="set-card">
        <h3>LAB SETTINGS</h3>
        <p className="help">Name and description shown to lab members and on join links.</p>
        <label className="ilm-auth-field"><span>Lab name</span><input value={labName} onChange={(e)=>setLabName(e.target.value)} /></label>
        <label className="ilm-auth-field"><span>Description</span><textarea value={labDesc} onChange={(e)=>setLabDesc(e.target.value)} rows={3} /></label>
        <div className="set-actions">
          <button className="btn btn-secondary" onClick={onOpenLabPicker}>Switch lab</button>
          <button className="btn btn-primary">Save lab</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsView });
