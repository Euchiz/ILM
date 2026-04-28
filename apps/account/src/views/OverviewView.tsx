import { useMemo } from "react";
import { Avatar, appUrl, useAuth } from "@ilm/ui";
import {
  useDashboardData,
  type InventoryStats,
  type PendingReviews,
  type ScheduleEntry,
  type TeamStats,
} from "../lib/dashboardData";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

const today = () =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

const formatScheduleTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
};

const formatScheduleDay = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const todayD = new Date();
  const sameDay =
    d.getFullYear() === todayD.getFullYear() &&
    d.getMonth() === todayD.getMonth() &&
    d.getDate() === todayD.getDate();
  if (sameDay) return "TODAY";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isTomorrow) return "TOMORROW";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" })
    .format(d)
    .toUpperCase();
};

// ---------------------------------------------------------------------------
// Status hero — operating status + 3 metrics + infinity art
// ---------------------------------------------------------------------------

const StatusBlock = ({
  activeProjects,
  teamMembers,
  pendingTotal,
  refreshing,
  onRefresh,
}: {
  activeProjects: number;
  teamMembers: number;
  pendingTotal: number;
  refreshing: boolean;
  onRefresh: () => void;
}) => {
  const status = pendingTotal === 0 ? "OPTIMAL" : pendingTotal > 5 ? "ATTENTION" : "STEADY";
  const statusCopy =
    pendingTotal === 0
      ? "Nothing waiting on review. All systems running within normal parameters."
      : pendingTotal === 1
        ? "1 request waiting on your review."
        : `${pendingTotal} requests waiting on review.`;

  return (
    <section className="ovw-card ovw-hero">
      <div className="ovw-hero-copy">
        <div className="ovw-hero-label-row">
          <span className="ovw-label">LAB OPERATING STATUS</span>
          <button
            type="button"
            className="ovw-refresh"
            onClick={onRefresh}
            aria-label="Refresh metrics"
            title="Refresh metrics"
          >
            <span className={refreshing ? "ovw-refresh-glyph is-spinning" : "ovw-refresh-glyph"} aria-hidden="true">
              ↻
            </span>
          </button>
        </div>
        <h2 className="ovw-status">{status}</h2>
        <p className="ovw-status-copy">{statusCopy}</p>
        <div className="ovw-metric-row">
          <div className="ovw-metric">
            <span>ACTIVE PROJECTS</span>
            <b>{formatNumber(activeProjects)}</b>
          </div>
          <div className="ovw-metric">
            <span>TEAM MEMBERS</span>
            <b>{formatNumber(teamMembers)}</b>
          </div>
          <div className="ovw-metric">
            <span>PENDING REVIEW</span>
            <b className={pendingTotal > 0 ? "ovw-metric-accent" : ""}>{formatNumber(pendingTotal)}</b>
          </div>
        </div>
      </div>
      <div className="ovw-hero-art" aria-hidden="true">
        <img src={`${APP_BASE_URL}assets/infinity.png`} alt="" />
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Upcoming schedule (calendar_events + bookings)
// ---------------------------------------------------------------------------

const ScheduleCard = ({ schedule }: { schedule: ScheduleEntry[] }) => {
  const calendarHref = appUrl("scheduler/", APP_BASE_URL);
  return (
    <section className="ovw-card ovw-schedule">
      <header>
        <h3>UPCOMING SCHEDULE</h3>
        <a className="ovw-card-link" href={calendarHref}>View calendar</a>
      </header>
      <p className="ovw-schedule-date">{today().toUpperCase()}</p>
      {schedule.length === 0 ? (
        <p className="ovw-empty">No upcoming events or bookings.</p>
      ) : (
        <ol className="ovw-timeline">
          {schedule.map((entry) => (
            <li key={entry.id}>
              <span className="ovw-time">{formatScheduleTime(entry.startTime)}</span>
              <span className={`ovw-ring${entry.kind === "booking" ? " ovw-ring--booking" : ""}`} />
              <div>
                <strong>{entry.title}</strong>
                <span>
                  {formatScheduleDay(entry.startTime)}
                  {entry.location ? ` · ${entry.location}` : ""}
                  {entry.kind === "booking" ? " · Booking" : ""}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Requests pending review — role-aware quick-jump card
// ---------------------------------------------------------------------------

type ReviewLink = {
  key: keyof PendingReviews;
  label: string;
  href: string;
  description: string;
};

const buildReviewLinks = (mode: "owner" | "admin" | "lead"): ReviewLink[] => {
  const projectsLink: ReviewLink = {
    key: "projects",
    label: "Projects",
    href: `${appUrl("project-manager/", APP_BASE_URL)}#review`,
    description: "Drafts submitted for review",
  };
  const ordersLink: ReviewLink = {
    key: "orders",
    label: "Order requests",
    href: `${appUrl("supply-manager/", APP_BASE_URL)}#review`,
    description: "Supply purchases awaiting approval",
  };
  const membersLink: ReviewLink = {
    key: "members",
    label: "Member requests",
    href: `${appUrl("", APP_BASE_URL)}#/team`,
    description: "People asking to join the lab",
  };
  const bookingsLink: ReviewLink = {
    key: "bookings",
    label: "Bookings",
    href: `${appUrl("scheduler/", APP_BASE_URL)}#bookings`,
    description: "Resource bookings needing approval",
  };
  const protocolsLink: ReviewLink = {
    key: "protocols",
    label: "Protocols",
    href: `${appUrl("protocol-manager/", APP_BASE_URL)}#reviews`,
    description: "Submissions for your projects",
  };

  if (mode === "owner") return [projectsLink, ordersLink, membersLink];
  if (mode === "admin") return [projectsLink, ordersLink, membersLink, bookingsLink];
  return [protocolsLink];
};

const ReviewQueueCard = ({
  mode,
  pending,
}: {
  mode: "owner" | "admin" | "lead" | "none";
  pending: PendingReviews;
}) => {
  const links = useMemo(() => (mode === "none" ? [] : buildReviewLinks(mode)), [mode]);

  const heading =
    mode === "owner"
      ? "OWNER REVIEW QUEUE"
      : mode === "admin"
        ? "ADMIN REVIEW QUEUE"
        : mode === "lead"
          ? "PROJECT-LEAD REVIEW QUEUE"
          : "REVIEW QUEUE";

  return (
    <section className="ovw-card ovw-reviews">
      <header>
        <h3>REQUESTS PENDING REVIEW</h3>
        <span className="ovw-card-pill">{heading}</span>
      </header>
      {mode === "none" ? (
        <p className="ovw-empty">
          No review surfaces for your role. Owners, admins, and project leads see review queues here.
        </p>
      ) : (
        <ul className="ovw-review-grid">
          {links.map((link) => {
            const count = pending[link.key];
            return (
              <li key={link.key}>
                <a className={`ovw-review-tile${count > 0 ? " has-pending" : ""}`} href={link.href}>
                  <span className="ovw-review-tile-count">{formatNumber(count)}</span>
                  <span className="ovw-review-tile-label">{link.label}</span>
                  <span className="ovw-review-tile-desc">{link.description}</span>
                  <span className="ovw-review-tile-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Inventory status — replaces resource utilization
// ---------------------------------------------------------------------------

const InventoryRadar = ({ stats }: { stats: InventoryStats }) => {
  // Six axes: 4 known classifications + 2 placeholder slots so the polygon
  // still reads as a hexagon while we wait for additional taxonomy.
  const axes: { label: string; value: number }[] = [
    { label: "Reagents", value: stats.reagents },
    { label: "Supplies", value: stats.supplies },
    { label: "Samples", value: stats.samples },
    { label: "Consumables", value: stats.consumables },
    { label: "Other 1", value: stats.other },
    { label: "Other 2", value: 0 },
  ];
  const max = Math.max(1, ...axes.map((a) => a.value));
  const cx = 75;
  const cy = 75;
  const radius = 52;
  // 6 evenly-spaced angles, starting at top (-90°)
  const points = axes.map((axis, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / axes.length;
    const r = (axis.value / max) * radius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      ringX: cx + Math.cos(angle) * radius,
      ringY: cy + Math.sin(angle) * radius,
      labelX: cx + Math.cos(angle) * (radius + 13),
      labelY: cy + Math.sin(angle) * (radius + 13),
      label: axis.label,
      value: axis.value,
    };
  });
  const polygonPoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ringPoints = points.map((p) => `${p.ringX.toFixed(1)},${p.ringY.toFixed(1)}`).join(" ");
  const innerRadii = [0.33, 0.66];
  return (
    <svg viewBox="0 0 150 150" className="ovw-inv-radar" role="img" aria-label="Inventory class distribution">
      <g fill="none" stroke="var(--ilm-line)">
        {innerRadii.map((scale) => (
          <polygon
            key={scale}
            points={points
              .map((p) => {
                const ix = cx + (p.ringX - cx) * scale;
                const iy = cy + (p.ringY - cy) * scale;
                return `${ix.toFixed(1)},${iy.toFixed(1)}`;
              })
              .join(" ")}
          />
        ))}
        <polygon points={ringPoints} />
        {points.map((p, i) => (
          <line key={i} x1={cx} y1={cy} x2={p.ringX} y2={p.ringY} />
        ))}
      </g>
      <polygon
        points={polygonPoints}
        fill="rgba(78,159,146,0.32)"
        stroke="var(--ilm-viridian)"
        strokeWidth="1.3"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--ilm-viridian)" />
      ))}
      {points.map((p, i) => (
        <text
          key={`l-${i}`}
          x={p.labelX}
          y={p.labelY}
          className="ovw-inv-radar-label"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
};

const InventoryCard = ({ stats }: { stats: InventoryStats }) => {
  const inventoryHref = appUrl("supply-manager/", APP_BASE_URL);
  return (
    <section className="ovw-card ovw-inventory">
      <header>
        <h3>INVENTORY STATUS</h3>
        <a className="ovw-card-link" href={inventoryHref}>View inventory</a>
      </header>
      <div className="ovw-inv-body">
        <InventoryRadar stats={stats} />
        <ul className="ovw-inv-stats">
          <li>
            <i style={{ background: "var(--ilm-viridian)" }} />
            <strong>{stats.total}</strong>
            <span>Total items</span>
          </li>
          <li>
            <i style={{ background: "var(--ilm-amber)" }} />
            <strong>{stats.criticalLow}</strong>
            <span>Low · needs reorder</span>
          </li>
          <li>
            <i style={{ background: "var(--ilm-viridian-2)" }} />
            <strong>{stats.inOrder}</strong>
            <span>In order</span>
          </li>
          <li>
            <i style={{ background: "var(--ilm-fg-4, #9aa3a0)" }} />
            <strong>{stats.unchecked}</strong>
            <span>Unchecked</span>
          </li>
        </ul>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Activity feed — recent updates across modules
// ---------------------------------------------------------------------------

const ActivityCard = ({
  entries,
}: {
  entries: { id: string; label: string; context: string; kind: string }[];
}) => (
  <section className="ovw-card ovw-activity">
    <header>
      <h3>ACTIVITY FEED</h3>
      <span className="ovw-card-pill">Recent</span>
    </header>
    {entries.length === 0 ? (
      <p className="ovw-empty">No recent activity.</p>
    ) : (
      <ul className="ovw-activity-list">
        {entries.map((e) => (
          <li key={e.id}>
            <span className={`ovw-activity-dot ovw-activity-dot--${e.kind}`} aria-hidden="true" />
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

// ---------------------------------------------------------------------------
// Team overview — kept
// ---------------------------------------------------------------------------

const TeamCard = ({ team }: { team: TeamStats }) => {
  const teamHref = `${appUrl("", APP_BASE_URL)}#/team`;
  return (
    <section className="ovw-card ovw-team">
      <header>
        <h3>TEAM OVERVIEW</h3>
        <a className="ovw-card-link" href={teamHref}>View team</a>
      </header>
      <div className="ovw-avatars">
        {team.recentAvatars.map((m) => (
          <Avatar key={m.id} size="md" name={m.name} email={m.email} url={m.headshotUrl} />
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
};

// ---------------------------------------------------------------------------
// Page composition
// ---------------------------------------------------------------------------

export const OverviewView = () => {
  const { activeLab, user } = useAuth();
  const data = useDashboardData(activeLab?.id ?? null, user?.id ?? null);

  const role = activeLab?.role;
  const reviewMode: "owner" | "admin" | "lead" | "none" =
    role === "owner"
      ? "owner"
      : role === "admin"
        ? "admin"
        : data.isProjectLead
          ? "lead"
          : "none";

  const visiblePending = useMemo(() => {
    if (reviewMode === "owner") return data.pending.projects + data.pending.orders + data.pending.members;
    if (reviewMode === "admin")
      return (
        data.pending.projects + data.pending.orders + data.pending.members + data.pending.bookings
      );
    if (reviewMode === "lead") return data.pending.protocols;
    return 0;
  }, [reviewMode, data.pending]);

  return (
    <div className="ovw-grid">
      <div
        className="ovw-corner"
        aria-hidden="true"
        style={{ backgroundImage: `url(${APP_BASE_URL}assets/lab-corridor.png)` }}
      />
      {data.error ? <p className="ovw-error">{data.error}</p> : null}
      <StatusBlock
        activeProjects={data.projects.total}
        teamMembers={data.team.total}
        pendingTotal={visiblePending}
        refreshing={data.refreshing}
        onRefresh={() => void data.refresh()}
      />
      <ScheduleCard schedule={data.schedule} />
      <ReviewQueueCard mode={reviewMode} pending={data.pending} />
      <InventoryCard stats={data.inventory} />
      <ActivityCard entries={data.activity} />
      <TeamCard team={data.team} />
    </div>
  );
};
