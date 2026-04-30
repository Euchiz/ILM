/* global React */

function HeroBanner({ status, statusCopy, projects, members, pending }) {
  return (
    <section className="ovw-hero">
      <div className="ovw-hero-art" aria-hidden="true">
        <img className="ovw-hero-bg" src="../../assets/lab-corridor.png" alt="" />
        <img className="ovw-hero-glyph" src="../../assets/infinity.png" alt="" />
        <div className="ovw-hero-veil" />
      </div>
      <div className="ovw-hero-panel lg-surface">
        <span className="lg-prism" />
        <div className="ovw-hero-label-row">
          <span className="ovw-hero-status-pill">
            <i /> LAB STATUS
          </span>
        </div>
        <h2 className="ovw-status">All Systems Operational</h2>
        <p className="ovw-status-copy">
          Laboratory operations are running smoothly.<br />
          {projects} experiments in progress across 4 labs.
        </p>
        <button type="button" className="ovw-hero-cta lg-surface is-interactive">
          <span className="lg-prism" />
          View Lab Overview <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}

function KpiRow({ projects, samples, inventoryValue, compliance }) {
  return (
    <section className="ovw-kpi-row">
      <KpiCard label="Active Experiments" value={projects} unit="In Progress"
        delta="+15% vs last 7 days" graphic={<KpiSparkline values={[3, 5, 4, 6, 7, 5, 8]} />} icon="flask" />
      <KpiCard label="Samples Analyzed" value={samples.toLocaleString()} unit="This Month"
        delta="+22% vs last month" graphic={<KpiBars values={[4, 7, 5, 8, 6, 9, 7, 10]} />} icon="vials" />
      <KpiCard label="Inventory Value" value={`$${Math.round(inventoryValue / 1000)}K`} unit="Total Value"
        delta="+8% vs last month" graphic={<KpiBars values={[5, 6, 7, 6, 8, 7, 9]} dim />} icon="cube" />
      <KpiCard label="Compliance Score" value={`${compliance}%`} unit="This Month"
        delta="+5% vs last month" graphic={<KpiDonut value={compliance} />} icon="shield" />
    </section>
  );
}

function KpiCard({ label, value, unit, delta, graphic, icon }) {
  return (
    <div className="ovw-kpi-card lg-surface">
      <span className="lg-prism" />
      <div className="ovw-kpi-head">
        <span className="ovw-kpi-icon" aria-hidden="true"><KpiIcon kind={icon} /></span>
        <span className="ovw-kpi-label">{label}</span>
      </div>
      <div className="ovw-kpi-body">
        <div className="ovw-kpi-figures">
          <strong>{value}</strong>
          <span>{unit}</span>
        </div>
        <div className="ovw-kpi-graphic" aria-hidden="true">{graphic}</div>
      </div>
      <div className="ovw-kpi-delta">↑ {delta}</div>
    </div>
  );
}

function KpiIcon({ kind }) {
  const stroke = "#4e9f92";
  switch (kind) {
    case "flask":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 19l-6-10V3" />
          <path d="M7 14h10" />
        </svg>
      );
    case "vials":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="3" width="4" height="18" rx="1.4" /><rect x="15" y="3" width="4" height="18" rx="1.4" />
          <path d="M5 14h4M15 11h4" />
        </svg>
      );
    case "cube":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l8 4.5v9L12 21 4 16.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" />
        </svg>
      );
  }
}

function KpiSparkline({ values }) {
  const max = Math.max(...values), min = Math.min(...values);
  const w = 90, h = 32;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="90" height="32">
      <defs>
        <linearGradient id="kpi-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(78,159,146,0.45)" /><stop offset="100%" stopColor="rgba(78,159,146,0)" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#kpi-spark)" />
      <polyline points={pts} fill="none" stroke="#4e9f92" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiBars({ values, dim }) {
  const max = Math.max(...values);
  const w = 90, h = 32, gap = 2;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="90" height="32">
      {values.map((v, i) => {
        const bh = (v / max) * (h - 2);
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx="1.5"
          fill={dim ? "rgba(78,159,146,0.55)" : "#4e9f92"} />;
      })}
    </svg>
  );
}

function KpiDonut({ value }) {
  const r = 14, c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <svg viewBox="0 0 36 36" width="36" height="36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(78,159,146,0.20)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="#4e9f92" strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 18 18)" />
    </svg>
  );
}

function RecentExperiments() {
  const rows = [
    { id: "EXP-2025-0416", state: "In Progress",  pi: "Dr. Elena Rossi",   when: "2h ago" },
    { id: "EXP-2025-0415", state: "In Progress",  pi: "Dr. Marcus Chen",   when: "5h ago" },
    { id: "EXP-2025-0414", state: "Review",       pi: "Dr. Aisha Patel",   when: "1d ago" },
    { id: "EXP-2025-0413", state: "Completed",    pi: "Dr. Elena Rossi",   when: "2d ago" },
    { id: "EXP-2025-0412", state: "Completed",    pi: "Dr. Marcus Chen",   when: "3d ago" },
  ];
  return (
    <section className="ovw-card ovw-list-card">
      <header><h3>RECENT EXPERIMENTS</h3><a className="ovw-card-link" href="#">View All</a></header>
      <ul className="ovw-list">
        {rows.map(r => (
          <li key={r.id} className="ovw-list-row">
            <span className="ovw-list-id">{r.id}</span>
            <span className={`ovw-state ovw-state--${r.state.toLowerCase().replace(" ", "-")}`}>● {r.state}</span>
            <span className="ovw-list-pi">{r.pi}</span>
            <span className="ovw-list-when">{r.when}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EquipmentStatus() {
  const rows = [
    { name: "HPLC System A",      state: "Operational", pct: 98 },
    { name: "Mass Spectrometer",  state: "Operational", pct: 95 },
    { name: "Incubator Suite 2",  state: "Operational", pct: 96 },
    { name: "Centrifuge Unit 3",  state: "Maintenance", pct: 0 },
    { name: "Freezer -80°C",      state: "Operational", pct: 100 },
  ];
  return (
    <section className="ovw-card ovw-list-card">
      <header><h3>EQUIPMENT STATUS</h3><a className="ovw-card-link" href="#">View All</a></header>
      <ul className="ovw-list">
        {rows.map(r => (
          <li key={r.name} className="ovw-equip-row">
            <span className="ovw-equip-dot" />
            <span className="ovw-equip-name">{r.name}</span>
            <span className={`ovw-state ovw-state--${r.state.toLowerCase()}`}>{r.state}</span>
            {r.state === "Maintenance"
              ? <span className="ovw-equip-pct ovw-equip-pct--alt">—</span>
              : <span className="ovw-equip-pct">{r.pct}%</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InventoryAlerts() {
  const rows = [
    { id: "1", name: "PDMS Polymer",     status: "Low Stock",     value: "12 units" },
    { id: "2", name: "Solvent Mix A",    status: "Low Stock",     value: "1.2 L" },
    { id: "3", name: "Antibody Solution",status: "Expiring Soon", value: "May 20, 2026", warn: true },
    { id: "4", name: "Cell Culture Media", status: "Low Stock",   value: "3 units" },
  ];
  return (
    <section className="ovw-card ovw-list-card">
      <header><h3>INVENTORY ALERTS</h3><a className="ovw-card-link" href="#">View All</a></header>
      <ul className="ovw-list">
        {rows.map(r => (
          <li key={r.id} className="ovw-alert-row">
            <span className="ovw-alert-marker" />
            <div className="ovw-alert-body">
              <strong>{r.name}</strong>
              <span>{r.status}</span>
            </div>
            <span className={`ovw-alert-value${r.warn ? " is-warn" : ""}`}>{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverviewView() {
  const data = {
    projects: 23,
    samples: 1248,
    inventoryValue: 237000,
    compliance: 98,
    members: 18,
    pending: { projects: 3, orders: 2, members: 1 },
  };
  const pendingTotal = data.pending.projects + data.pending.orders + data.pending.members;
  const status = pendingTotal === 0 ? "OPTIMAL" : pendingTotal > 5 ? "ATTENTION" : "STEADY";

  return (
    <div className="ovw-grid">
      <HeroBanner status={status} statusCopy="" projects={data.projects} members={data.members} pending={pendingTotal} />
      <KpiRow projects={data.projects} samples={data.samples} inventoryValue={data.inventoryValue} compliance={data.compliance} />
      <RecentExperiments />
      <EquipmentStatus />
      <InventoryAlerts />
    </div>
  );
}

Object.assign(window, { OverviewView });
