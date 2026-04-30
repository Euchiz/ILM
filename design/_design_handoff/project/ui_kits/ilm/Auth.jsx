/* global React */
const { useState: useStateA } = React;

function AuthScreen({ onSignedIn }) {
  const [email, setEmail] = useStateA("anika@rhinelab.bio");
  const [pw, setPw] = useStateA("••••••••");
  return (
    <div className="ilm-auth-screen">
      <div className="ilm-auth-card">
        <p className="ils-brand-tag" style={{margin:"0 0 0.4rem"}}>VIRIDIAN <b>BLUE LABS</b> · ILM</p>
        <h1 className="ilm-auth-title">Sign in</h1>
        <p className="ilm-auth-sub">Integrated Lab Manager — sign in with your lab email.</p>
        <label className="ilm-auth-field"><span>Email</span><input value={email} onChange={(e)=>setEmail(e.target.value)} /></label>
        <label className="ilm-auth-field"><span>Password</span><input type="password" value={pw} onChange={(e)=>setPw(e.target.value)} /></label>
        <button className="ilm-auth-submit" onClick={onSignedIn}>Continue</button>
        <p className="ilm-auth-note" style={{textAlign:"center", marginTop:"0.9rem"}}>
          New here? <a href="#" style={{color:"var(--ilm-viridian)"}}>Create a lab</a>
        </p>
      </div>
    </div>
  );
}

const SAMPLE_LABS = [
  { id: "1", name: "Rhine Lab L.L.C.", role: "Owner",  desc: "CRISPR · sequencing · computational" },
  { id: "2", name: "Hibiscus Bio",      role: "Admin",  desc: "Plant genomics" },
  { id: "3", name: "North Atlas Lab",   role: "Member", desc: "Structural biology core" },
];

function LabPicker({ onPick, onClose }) {
  return (
    <div className="lp-modal">
      <div className="lp-card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div>
            <h2 className="ilm-auth-title" style={{fontSize:"1.3rem", marginBottom:0}}>Choose a lab</h2>
            <p className="ilm-auth-note" style={{margin:"0.25rem 0 0"}}>Switch between the labs you're a member of.</p>
          </div>
          {onClose && <button className="ilm-text-button" onClick={onClose}>Close</button>}
        </div>
        <ul className="lp-list">
          {SAMPLE_LABS.map(l => (
            <li key={l.id} className="lp-row" onClick={() => onPick && onPick(l)}>
              <span className="lp-row-mark"><img src="../../assets/geo-mark.png" alt="" /></span>
              <div><strong>{l.name}</strong><span>{l.desc}</span></div>
              <span className="lp-role">{l.role}</span>
            </li>
          ))}
        </ul>
        <div style={{marginTop:"1rem", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <a href="#" style={{color:"var(--ilm-viridian)", fontFamily:"var(--ilm-font-display)", fontSize:"0.85rem"}}>+ Create new lab</a>
          <span style={{fontFamily:"var(--ilm-font-display)", fontSize:"0.6rem", letterSpacing:"0.14em", color:"var(--ilm-fg-4)"}}>POWERED BY RHINE LAB</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen, LabPicker });
