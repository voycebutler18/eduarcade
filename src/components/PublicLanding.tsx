import {useRef,useState} from "react";
import {LegalFooter} from "./LegalPages";

const operations=[
  ["01","Lease-to-ledger intake","Drop a signed lease. NOVA extracts the property, resident, rent rules and key dates into an operating record."],
  ["02","Money Chaser","Rent charges, payment promises and ledger activity stay monitored in the background so exceptions rise to the top."],
  ["03","Maintenance command","Resident photos become structured maintenance requests with urgency and trade context before you review next steps."],
  ["04","Local intelligence","Official weather and public-data signals are matched to the property instead of buried in a generic news feed."],
  ["05","Compliance watch","Jurisdiction-aware workflows keep source verification and human review in the loop for consequential decisions."],
  ["06","Resident NOVA","Resident answers can be grounded in the actual lease, ledger, maintenance and property record instead of generic chatbot responses."]
];

export function PublicLanding({onStart,onSignIn}:{onStart:()=>void;onSignIn:()=>void}){
  const input=useRef<HTMLInputElement>(null),[fileName,setFileName]=useState("");
  function choose(){input.current?.click()}
  function selected(file?:File){if(!file)return;setFileName(file.name);onStart()}
  return <div className="rp-public rp-public-v2">
    <header className="rp-public-nav">
      <a className="rp-brand" href="/"><span className="rp-brand-mark">R</span><span><strong>RentPilot</strong><small>Property operations</small></span></a>
      <nav><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#pricing">Pricing</a></nav>
      <div><button className="rp-link-btn" onClick={onSignIn}>Sign in</button><button className="rp-nav-cta" onClick={onStart}>Open RentPilot</button></div>
    </header>
    <main>
      <section className="rp-hero-v2">
        <div className="rp-hero-copy">
          <p className="rp-overline"><span></span>AUTONOMOUS PROPERTY OPERATIONS</p>
          <h1>Stop managing software.<br/><em>Manage the exceptions.</em></h1>
          <p className="rp-hero-lead">RentPilot keeps rent operations, maintenance, resident activity and property intelligence moving in the background. NOVA surfaces the decisions that actually need you.</p>
          <div className="rp-hero-ctas"><button className="rp-main-cta" onClick={onStart}>Get started <span>→</span></button><a href="#workflow">See the operating model</a></div>
          <div className="rp-hero-proof"><span>Built for independent operators</span><span>Human approval for consequential actions</span><span>Property-specific intelligence</span></div>
        </div>
        <div className="rp-brief-demo" aria-label="NOVA Morning Brief preview">
          <div className="rp-demo-bar"><div><span className="rp-live-dot"></span>NOVA · LIVE OPERATIONS</div><small>Morning Brief</small></div>
          <div className="rp-demo-head"><div><small>THURSDAY · 8:04 AM</small><h2>Your portfolio is under control.</h2><p>Routine work is handled. Two items need your decision.</p></div><span className="rp-demo-score">02<small>NEED YOU</small></span></div>
          <div className="rp-demo-metrics"><div><small>MONTHLY RENT</small><b>$18,420</b><span>Monitored</span></div><div><small>PAST DUE</small><b>$0</b><span>Clear</span></div><div><small>OCCUPANCY</small><b>96%</b><span>Active</span></div></div>
          <div className="rp-demo-queue"><div className="rp-demo-row"><span className="rp-row-icon">01</span><div><b>Vendor approval ready</b><small>HVAC · Unit 204 · matched to approved vendor</small></div><button onClick={onStart}>Review</button></div><div className="rp-demo-row"><span className="rp-row-icon">02</span><div><b>Lease exception flagged</b><small>NOVA found a date that needs confirmation</small></div><button onClick={onStart}>Review</button></div></div>
          <div className="rp-demo-foot"><span>✓ 17 routine actions handled in the background</span><button onClick={onStart}>Open activity →</button></div>
        </div>
      </section>

      <section className="rp-lease-strip" id="workflow"><div><p className="rp-overline dark">THE FASTEST WAY IN</p><h2>Your lease is already the setup manual.</h2><p>Start with the document you already have. RentPilot uses it to begin building the operating context instead of making you configure endless screens first.</p></div><div className="rp-drop" onClick={choose} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();selected(e.dataTransfer.files?.[0])}}><input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e=>selected(e.target.files?.[0])}/><span className="rp-file-icon">PDF</span><div><b>{fileName||"Drop a lease PDF here"}</b><small>{fileName?"Continue to secure account setup":"or click to choose a file · PDF"}</small></div><strong>→</strong></div></section>

      <section className="rp-operating-model" id="platform"><div className="rp-section-intro"><p className="rp-overline dark">ONE OPERATING LAYER</p><h2>Software should do the chasing.<br/>You should make the calls.</h2><p>RentPilot is organized around work being delegated to the system—not around forcing an owner to babysit menus all day.</p></div><div className="rp-operation-grid">{operations.map(([n,title,copy])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="rp-control-band"><div><p className="rp-overline">THE RENTPILOT DIFFERENCE</p><h2>One brief. One exception queue.<br/>A whole lot less clicking.</h2></div><div className="rp-control-list"><p><b>01</b><span><strong>Background operations</strong>Routine monitoring continues when you are not logged in.</span></p><p><b>02</b><span><strong>Grounded resident context</strong>NOVA works from property records instead of pretending every resident has the same lease.</span></p><p><b>03</b><span><strong>Approval where it matters</strong>Vendor dispatch and consequential decisions can stay behind human review.</span></p></div></section>

      <section id="pricing" className="rp-pricing-v2"><div><p className="rp-overline dark">STRAIGHTFORWARD ANNUAL PRICING</p><h2>Start small. Keep the operating system.</h2><p>Core RentPilot operations stay together as your portfolio grows.</p></div><div className="rp-price-row"><Price name="Owner" price="$99" detail="1–5 units"/><Price name="Growth" price="$249" detail="6–25 units"/><Price name="Portfolio" price="$499" detail="26–100 units"/></div><div className="rp-pricing-note"><span>101–200 units: $799/year · Larger portfolios quoted separately.</span><button className="rp-main-cta" onClick={onStart}>Build your workspace →</button></div></section>

      <section className="rp-final-cta"><p className="rp-overline">PROPERTY MANAGEMENT WITHOUT THE SOFTWARE BABYSITTING</p><h2>Give NOVA the routine work.<br/>Keep the judgment.</h2><button onClick={onStart}>Get started with RentPilot →</button><small>No setup fee · Built for real property operators</small></section>
      <section className="rp-trust-strip"><div><b>Privacy is part of the product.</b><p>RentPilot does not sell landlord or resident personal information and does not use it for third-party targeted advertising.</p></div><a className="ghost-btn" href="/?legal=privacy">Read our Privacy Policy</a></section>
    </main>
    <LegalFooter/>
  </div>
}
function Price({name,price,detail}:{name:string;price:string;detail:string}){return <article><small>{detail}</small><h3>{name}</h3><strong>{price}<span>/year</span></strong><p>NOVA, resident portal, maintenance operations, local intelligence and core workflows included.</p></article>}
