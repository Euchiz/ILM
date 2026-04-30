/* global React, Avatar */

const TEAM_DATA = [
  { id: "1", name: "Anika Mendez",  email: "anika@rhinelab.bio",  role: "owner",  status: "Active" },
  { id: "2", name: "Joaquin Khan",  email: "j.khan@rhinelab.bio", role: "admin",  status: "Active" },
  { id: "3", name: "Sara Rao",      email: "sara@rhinelab.bio",   role: "admin",  status: "Active" },
  { id: "4", name: "Davide Marchetti", email: "davide@rhinelab.bio", role: "admin", status: "Active" },
  { id: "5", name: "Yuki Tanaka",   email: "yuki@rhinelab.bio",   role: "member", status: "Active" },
  { id: "6", name: "Priya Shah",    email: "priya@rhinelab.bio",  role: "member", status: "Active" },
  { id: "7", name: "Léa Dubois",    email: "lea@rhinelab.bio",    role: "member", status: "Pending" },
];

function TeamView() {
  return (
    <div className="team-grid">
      <div className="team-roster">
        <header>
          <h3>LAB ROSTER · 18 ACTIVE</h3>
          <button className="btn btn-primary">Invite member</button>
        </header>
        {TEAM_DATA.map(m => (
          <div className="team-row" key={m.id}>
            <Avatar name={m.name} />
            <div><strong>{m.name}</strong><span>{m.email}</span></div>
            <span className={`team-pill ${m.role}`}>{m.role}</span>
            <span className="team-status">{m.status}</span>
            <span style={{color: "var(--ilm-fg-4)"}}>⋯</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TeamView });
