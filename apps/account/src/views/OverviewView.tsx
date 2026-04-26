import { useMemo } from "react";
import { useAuth } from "@ilm/ui";
import { useDashboardData, type ProjectStateCounts, type ProtocolStats, type InventoryStats, type TeamStats } from "../lib/dashboardData";

const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

const today = () =>
  new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());

const StatusBlock = ({
  projects,
  protocols,
  team,
  inventory,
}: {
  projects: ProjectStateCounts;
  protocols: ProtocolStats;
  team: TeamStats;
  inventory: InventoryStats;
}) => {
  const compliance = useMemo(() => {
    if (protocols.total === 0) return 100;
    const compliant = protocols.total - protocols.inReview;
    return Math.max(0, Math.min(100, Math.round((compliant / protocols.total) * 100)));
  }, [protocols.total, protocols.inReview]);

  const hasCritical = inventory.criticalLow > 0;
  const status = hasCritical ? "ATTENTION" : protocols.inReview > 0 ? "STEADY" : "OPTIMAL";
  const statusCopy = hasCritical
    ? "Some inventory items need reordering."
    : protocols.inReview > 0
      ? "Reviews pending across active protocols."
      : "All systems running within normal parameters.";

  return (
    <section className="ovw-card ovw-hero">
      <div className="ovw-hero-copy">
        <span className="ovw-label">LAB OPERATING STATUS</span>
        <h2 className="ovw-status">{status}</h2>
        <p className="ovw-status-copy">{statusCopy}</p>
        <div className="ovw-metric-row">
          <div className="ovw-metric">
            <span>ACTIVE PROJECTS</span>
            <b>{formatNumber(projects.total)}</b>
          </div>
          <div className="ovw-metric">
            <span>PROTOCOLS</span>
            <b>{formatNumber(protocols.total)}</b>
          </div>
          <div className="ovw-metric">
            <span>TEAM MEMBERS</span>
            <b>{formatNumber(team.total)}</b>
          </div>
          <div className="ovw-metric">
            <span>COMPLIANCE</span>
            <b className="ovw-metric-accent">{compliance}%</b>
          </div>
        </div>
      </div>
      <div className="ovw-hero-art" aria-hidden="true">
        <svg viewBox="0 0 560 260" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="ovw-flow" x1="0" x2="1">
              <stop offset="0" stopColor="rgba(78,159,146,0.0)" />
              <stop offset=".4" stopColor="rgba(78,159,146,0.45)" />
              <stop offset=".6" stopColor="rgba(78,159,146,0.45)" />
              <stop offset="1" stopColor="rgba(78,159,146,0.0)" />
            </linearGradient>
          </defs>
          <path
            d="M55 135 C142 28 222 35 282 132 C342 228 423 230 506 126"
            fill="none"
            stroke="url(#ovw-flow)"
            strokeWidth="22"
            strokeLinecap="round"
          />
          <path
            d="M55 125 C142 232 222 225 282 128 C342 32 423 30 506 134"
            fill="none"
            stroke="rgba(47,125,114,0.22)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <circle cx="151" cy="50" r="3" fill="var(--ilm-ink)" />
          <circle cx="446" cy="68" r="3" fill="var(--ilm-ink)" />
          <circle cx="458" cy="200" r="3" fill="var(--ilm-ink)" />
        </svg>
        <div className="ovw-node-label ovw-node-1">
          <strong>SYSTEMS</strong>
          <em>Synced</em>
        </div>
        <div className="ovw-node-label ovw-node-2">
          <strong>PROTOCOLS</strong>
          <em>{protocols.inReview > 0 ? `${protocols.inReview} in review` : "Up to date"}</em>
        </div>
        <div className="ovw-node-label ovw-node-3">
          <strong>DATA INTEGRITY</strong>
          <em>Verified</em>
        </div>
      </div>
    </section>
  );
};

const ScheduleCard = () => (
  <section className="ovw-card ovw-schedule">
    <header>
      <h3>UPCOMING SCHEDULE</h3>
      <span className="ovw-card-link">View calendar</span>
    </header>
    <p className="ovw-schedule-date">{today().toUpperCase()}</p>
    <ol className="ovw-timeline">
      <li>
        <span className="ovw-time">--</span>
        <span className="ovw-ring" />
        <div>
          <strong>Calendar coming soon</strong>
          <span>Lab events, equipment slots, and reviews</span>
        </div>
      </li>
      <li>
        <span className="ovw-time">--</span>
        <span className="ovw-ring" />
        <div>
          <strong>Protocol reviews</strong>
          <span>Pending items will surface here</span>
        </div>
      </li>
      <li>
        <span className="ovw-time">--</span>
        <span className="ovw-ring" />
        <div>
          <strong>Equipment maintenance</strong>
          <span>Track from inventory once enabled</span>
        </div>
      </li>
    </ol>
  </section>
);

const Donut = ({ counts }: { counts: ProjectStateCounts }) => {
  const total = counts.total || 1;
  const segments = [
    { value: counts.published, color: "var(--ilm-viridian)" },
    { value: counts.draft, color: "var(--ilm-viridian-2)" },
    { value: counts.deleted, color: "var(--ilm-fg-4)" },
  ];
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = segments.map((s, i) => {
    const length = (s.value / total) * circumference;
    const node = (
      <circle
        key={i}
        r={radius}
        cx="50"
        cy="50"
        fill="none"
        stroke={s.color}
        strokeWidth="14"
        strokeDasharray={`${length} ${circumference - length}`}
        strokeDashoffset={-offset}
        transform="rotate(-90 50 50)"
      />
    );
    offset += length;
    return node;
  });
  return (
    <svg viewBox="0 0 100 100" className="ovw-donut">
      <circle r={radius} cx="50" cy="50" fill="none" stroke="var(--ilm-line)" strokeWidth="14" />
      {arcs}
      <text x="50" y="49" textAnchor="middle" className="ovw-donut-num">
        {counts.total}
      </text>
      <text x="50" y="62" textAnchor="middle" className="ovw-donut-label">
        TOTAL
      </text>
    </svg>
  );
};

const ProjectsCard = ({ counts }: { counts: ProjectStateCounts }) => (
  <section className="ovw-card ovw-projects">
    <header>
      <h3>PROJECTS OVERVIEW</h3>
      <span className="ovw-card-link">View all projects</span>
    </header>
    <div className="ovw-donut-wrap">
      <Donut counts={counts} />
      <ul className="ovw-legend">
        <li>
          <i style={{ background: "var(--ilm-viridian)" }} />
          <strong>{counts.published}</strong>
          <span>Published</span>
        </li>
        <li>
          <i style={{ background: "var(--ilm-viridian-2)" }} />
          <strong>{counts.draft}</strong>
          <span>Drafts</span>
        </li>
        <li>
          <i style={{ background: "var(--ilm-fg-4)" }} />
          <strong>{counts.deleted}</strong>
          <span>In recycle</span>
        </li>
      </ul>
    </div>
  </section>
);

const ProtocolsCard = ({ stats }: { stats: ProtocolStats }) => {
  const lifecycleTone = (status: string | null): "active" | "review" | "muted" => {
    const lc = (status ?? "").toLowerCase();
    if (lc === "active") return "active";
    if (lc === "archived") return "muted";
    return "review";
  };
  return (
    <section className="ovw-card ovw-protocols">
      <header>
        <h3>PROTOCOLS</h3>
        <span className="ovw-card-link">View all protocols</span>
      </header>
      {stats.recent.length === 0 ? (
        <p className="ovw-empty">No protocols yet.</p>
      ) : (
        <ul className="ovw-protocol-list">
          {stats.recent.map((p) => (
            <li key={p.id}>
              <span className="ovw-square-glyph" aria-hidden="true" />
              <div>
                <strong>{p.title}</strong>
                <span>{p.description?.slice(0, 48) || (p.lifecycleStatus ?? "Draft")}</span>
              </div>
              <span className={`ovw-tag ovw-tag--${lifecycleTone(p.lifecycleStatus)}`}>
                {(p.lifecycleStatus ?? "draft").toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const InventoryCard = ({ stats }: { stats: InventoryStats }) => (
  <section className="ovw-card ovw-inventory">
    <header>
      <h3>INVENTORY STATUS</h3>
      <span className="ovw-card-link">View inventory</span>
    </header>
    <div className="ovw-radar-wrap">
      <svg viewBox="0 0 150 150" className="ovw-radar" aria-hidden="true">
        <g transform="translate(75 75)" fill="none" stroke="var(--ilm-line)">
          <polygon points="0,-65 56,-32 56,32 0,65 -56,32 -56,-32" />
          <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25" />
          <polygon points="0,-35 30,-17 30,17 0,35 -30,17 -30,-17" />
          <line x1="0" y1="-70" x2="0" y2="70" />
          <line x1="-61" y1="-35" x2="61" y2="35" />
          <line x1="-61" y1="35" x2="61" y2="-35" />
          <polygon
            points="0,-51 40,-15 33,29 0,44 -45,22 -34,-28"
            fill="rgba(78,159,146,0.30)"
            stroke="var(--ilm-viridian-2)"
          />
          <polygon
            points="0,-35 28,-10 23,20 0,30 -31,15 -23,-19"
            fill="rgba(47,125,114,0.45)"
            stroke="var(--ilm-viridian)"
          />
        </g>
      </svg>
      <ul className="ovw-inv-stats">
        <li>
          <i style={{ background: "var(--ilm-viridian)" }} />
          <strong>{stats.reagents}</strong>
          <span>Reagents · in stock</span>
        </li>
        <li>
          <i style={{ background: "var(--ilm-viridian-2)" }} />
          <strong>{stats.consumables}</strong>
          <span>Consumables</span>
        </li>
        <li>
          <i style={{ background: "var(--ilm-blue)" }} />
          <strong>{stats.supplies + stats.samples + stats.other}</strong>
          <span>Other supplies</span>
        </li>
        <li>
          <i style={{ background: "var(--ilm-amber)" }} />
          <strong>{stats.criticalLow}</strong>
          <span>Critical low · reorder</span>
        </li>
      </ul>
    </div>
  </section>
);

const FundingCard = () => (
  <section className="ovw-card ovw-funding">
    <header>
      <h3>FUNDING OVERVIEW</h3>
      <span className="ovw-card-link">View funding</span>
    </header>
    <p className="ovw-fund-amount">$0.00</p>
    <p className="ovw-fund-sub">FUNDING MANAGER ARRIVING IN STAGE 4D</p>
    <ul className="ovw-fund-rows">
      <li>
        <span className="ovw-square-glyph">$</span>
        <div>
          <strong>$0</strong>
          <span>Active grants</span>
        </div>
      </li>
      <li>
        <span className="ovw-square-glyph">~</span>
        <div>
          <strong>$0</strong>
          <span>Pending</span>
        </div>
      </li>
      <li>
        <span className="ovw-square-glyph">!</span>
        <div>
          <strong>$0</strong>
          <span>Expiring (90 days)</span>
        </div>
      </li>
    </ul>
    <div className="ovw-bars" aria-hidden="true">
      {[35, 50, 72, 28, 60, 98].map((h, i) => (
        <i key={i} style={{ height: `${h}px` }} />
      ))}
    </div>
  </section>
);

const ActivityCard = ({ entries }: { entries: { id: string; label: string; context: string }[] }) => (
  <section className="ovw-card ovw-activity">
    <header>
      <h3>ACTIVITY FEED</h3>
      <span className="ovw-card-pill">All activity</span>
    </header>
    {entries.length === 0 ? (
      <p className="ovw-empty">No recent activity.</p>
    ) : (
      <ul className="ovw-activity-list">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="ovw-activity-dot" aria-hidden="true" />
            <div>
              <strong>{e.label}</strong>
              <span>{e.context}</span>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const ResourceCard = ({
  projects,
  protocols,
  inventory,
  team,
}: {
  projects: ProjectStateCounts;
  protocols: ProtocolStats;
  inventory: InventoryStats;
  team: TeamStats;
}) => {
  const cells = [
    {
      label: "ACTIVE PROJECT MIX",
      value: `${projects.total ? Math.round((projects.published / Math.max(1, projects.total)) * 100) : 0}%`,
      tone: "ovw-spark--green",
    },
    {
      label: "PROTOCOL ACTIVATION",
      value: `${protocols.total ? Math.round((protocols.active / Math.max(1, protocols.total)) * 100) : 0}%`,
      tone: "ovw-spark--green",
    },
    {
      label: "STOCK COVERAGE",
      value:
        inventory.total > 0
          ? `${Math.round(((inventory.total - inventory.criticalLow) / inventory.total) * 100)}%`
          : "—",
      tone: inventory.criticalLow > 0 ? "ovw-spark--orange" : "ovw-spark--green",
    },
    {
      label: "TEAM PARTICIPATION",
      value: team.total > 0 ? `${team.total}` : "—",
      tone: "ovw-spark--neutral",
    },
  ];
  return (
    <section className="ovw-card ovw-resource">
      <header>
        <h3>RESOURCE UTILIZATION</h3>
        <span className="ovw-card-pill">This week</span>
      </header>
      <ul className="ovw-resource-grid">
        {cells.map((c) => (
          <li key={c.label}>
            <span className="ovw-resource-label">{c.label}</span>
            <strong>{c.value}</strong>
            <span className={`ovw-spark ${c.tone}`} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const TeamCard = ({ team }: { team: TeamStats }) => (
  <section className="ovw-card ovw-team">
    <header>
      <h3>TEAM OVERVIEW</h3>
      <span className="ovw-card-link">View team</span>
    </header>
    <div className="ovw-avatars">
      {team.recentAvatars.map((m) => (
        <span className="ovw-avatar" key={m.id} title={m.email ?? ""}>
          {m.label}
        </span>
      ))}
      {team.total > team.recentAvatars.length ? (
        <span className="ovw-avatar ovw-avatar--more">+{team.total - team.recentAvatars.length}</span>
      ) : null}
    </div>
    <ul className="ovw-team-stats">
      <li>
        <strong>{team.total}</strong>
        <span>Active members</span>
      </li>
      <li>
        <strong>{team.owners}</strong>
        <span>Owner{team.owners === 1 ? "" : "s"}</span>
      </li>
      <li>
        <strong className="ovw-team-stats-accent">{team.admins}</strong>
        <span>Admin{team.admins === 1 ? "" : "s"}</span>
      </li>
      <li>
        <strong>{team.members}</strong>
        <span>Member{team.members === 1 ? "" : "s"}</span>
      </li>
    </ul>
  </section>
);

export const OverviewView = () => {
  const { activeLab } = useAuth();
  const data = useDashboardData(activeLab?.id ?? null);

  return (
    <div className="ovw-grid">
      {data.error ? <p className="ovw-error">{data.error}</p> : null}
      <StatusBlock projects={data.projects} protocols={data.protocols} team={data.team} inventory={data.inventory} />
      <ScheduleCard />
      <ProjectsCard counts={data.projects} />
      <ProtocolsCard stats={data.protocols} />
      <InventoryCard stats={data.inventory} />
      <FundingCard />
      <ActivityCard entries={data.activity} />
      <ResourceCard projects={data.projects} protocols={data.protocols} inventory={data.inventory} team={data.team} />
      <TeamCard team={data.team} />
    </div>
  );
};
