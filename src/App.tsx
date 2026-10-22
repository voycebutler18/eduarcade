import { useMemo, useState } from "react";

type View = "overview" | "properties" | "tenants" | "money" | "maintenance" | "inbox" | "vendors" | "ai";

const nav: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "properties", label: "Properties" },
  { id: "tenants", label: "Tenants" },
  { id: "money", label: "Money Chaser" },
  { id: "maintenance", label: "Maintenance" },
  { id: "inbox", label: "Inbox" },
  { id: "vendors", label: "Vendors" },
  { id: "ai", label: "AI Activity" },
];

const overdue = [
  { tenant: "James W.", unit: "Oak Terrace · 2B", amount: 1600, days: 6, status: "Promise Friday" },
  { tenant: "Maria R.", unit: "Pine Court · 1A", amount: 1425, days: 4, status: "Reminder sent" },
  { tenant: "David K.", unit: "Oak Terrace · 4C", amount: 800, days: 2, status: "Partial payment" },
];

const maintenance = [
  { issue: "Active kitchen leak", unit: "Oak Terrace · 2B", priority: "Emergency", status: "Vendor contacted" },
  { issue: "AC not cooling", unit: "Pine Court · 3A", priority: "High", status: "Awaiting approval" },
  { issue: "Bedroom door latch", unit: "Oak Terrace · 1C", priority: "Routine", status: "Scheduled" },
];

function MoneyChaser() {
  return <section className="panel-card">
    <div className="section-head"><div><p className="eyebrow">Revenue recovery</p><h2>Money Chaser</h2></div><button className="primary-btn">Run follow-ups</button></div>
    <div className="mini-grid">
      <div className="metric"><span>Outstanding</span><strong>$3,825</strong><small>Across 3 tenants</small></div>
      <div className="metric"><span>Promises to pay</span><strong>$1,600</strong><small>1 promise active</small></div>
      <div className="metric"><span>Recovered this month</span><strong>$2,940</strong><small>AI-assisted follow-up</small></div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Unit</th><th>Balance</th><th>Late</th><th>Status</th><th></th></tr></thead>
    <tbody>{overdue.map(row => <tr key={row.tenant}><td><b>{row.tenant}</b></td><td>{row.unit}</td><td>{"$" + row.amount.toLocaleString()}</td><td>{row.days} days</td><td><span className="pill warn">{row.status}</span></td><td><button className="ghost-btn">Open</button></td></tr>)}</tbody></table></div>
  </section>
}

function Maintenance() {
  return <section className="panel-card">
    <div className="section-head"><div><p className="eyebrow">Operations</p><h2>Maintenance AI</h2></div><button className="primary-btn">New request</button></div>
    <div className="cards-list">{maintenance.map((item) => <article className="ticket" key={item.issue}>
      <div><span className={item.priority === "Emergency" ? "priority emergency" : item.priority === "High" ? "priority high" : "priority"}>{item.priority}</span><h3>{item.issue}</h3><p>{item.unit}</p></div>
      <div className="ticket-side"><span>{item.status}</span><button className="ghost-btn">Review</button></div>
    </article>)}</div>
  </section>
}

function Placeholder({title, copy}:{title:string; copy:string}) {
  return <section className="panel-card empty-state"><p className="eyebrow">RentPilot AI</p><h2>{title}</h2><p>{copy}</p><button className="primary-btn">Add first item</button></section>
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const current = useMemo(() => nav.find(n => n.id === view)?.label ?? "Overview", [view]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="logo"><div className="logo-mark">R</div><div><strong>RentPilot AI</strong><span>Property operations</span></div></div>
      <nav>{nav.map(item => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="ai-chip"><span className="pulse"></span><div><b>AI is active</b><small>7 actions today</small></div></div><button className="nav-item">Settings</button></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><p className="eyebrow">Workspace</p><h1>{current}</h1></div><div className="top-actions"><button className="ghost-btn">Ask AI</button><button className="primary-btn">+ Add property</button><div className="avatar">PB</div></div></header>

      {view === "overview" && <>
        <section className="hero"><div><p className="eyebrow">Portfolio pulse</p><h2>Your properties are under control.</h2><p>RentPilot is tracking revenue, tenant communication, and maintenance in one place.</p></div><div className="health"><span>Portfolio health</span><strong>92%</strong><small>2 items need approval</small></div></section>
        <section className="stat-grid">
          <article><span>Expected rent</span><strong>$28,450</strong><small>This month</small></article>
          <article><span>Collected</span><strong>$24,625</strong><small className="good">86.6% collected</small></article>
          <article><span>Outstanding</span><strong>$3,825</strong><small className="bad">3 tenants overdue</small></article>
          <article><span>Open maintenance</span><strong>4</strong><small>1 emergency</small></article>
        </section>

        <section className="dashboard-grid">
          <div className="panel-card">
            <div className="section-head"><div><p className="eyebrow">Needs attention</p><h2>Priority queue</h2></div><span className="count">5</span></div>
            <div className="attention">
              <button><span className="dot red"></span><div><b>3 overdue tenants</b><small>$3,825 total outstanding</small></div><strong>→</strong></button>
              <button><span className="dot red"></span><div><b>Emergency plumbing request</b><small>Oak Terrace · Unit 2B</small></div><strong>→</strong></button>
              <button><span className="dot amber"></span><div><b>2 payment promises</b><small>Next promise due Friday</small></div><strong>→</strong></button>
              <button><span className="dot amber"></span><div><b>2 leases expiring soon</b><small>Within 60 days</small></div><strong>→</strong></button>
            </div>
          </div>

          <div className="panel-card">
            <div className="section-head"><div><p className="eyebrow">Autopilot</p><h2>AI activity today</h2></div><span className="live">LIVE</span></div>
            <div className="activity">
              <div><span>14</span><p><b>Rent reminders sent</b><small>3 tenants responded</small></p></div>
              <div><span>4</span><p><b>Maintenance requests triaged</b><small>1 escalated for approval</small></p></div>
              <div><span>2</span><p><b>Vendors contacted</b><small>1 appointment booked</small></p></div>
              <div><span>2</span><p><b>Payment promises logged</b><small>$2,425 scheduled</small></p></div>
            </div>
          </div>
        </section>

        <MoneyChaser />
      </>}

      {view === "money" && <MoneyChaser />}
      {view === "maintenance" && <Maintenance />}
      {view === "properties" && <Placeholder title="Properties" copy="Add rental properties, units, occupancy, rent targets, and operational status." />}
      {view === "tenants" && <Placeholder title="Tenants" copy="Tenant profiles will connect leases, balances, payment promises, maintenance, and messages." />}
      {view === "inbox" && <Placeholder title="Property Inbox" copy="One inbox for tenant questions, payment conversations, maintenance updates, and AI-assisted replies." />}
      {view === "vendors" && <Placeholder title="Vendors" copy="Track approved vendors, trades, service areas, availability, quotes, and job history." />}
      {view === "ai" && <Placeholder title="AI Activity" copy="Every automated action will be logged here with status, reason, source, and approval history." />}
    </main>
  </div>;
}
