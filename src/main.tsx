import React,{useEffect,useState} from "react";
import ReactDOM from "react-dom/client";
import "./lib/leaseVisionFetchPatch";
import App from "./App";
import {supabase} from "./lib/supabase";
import {ResidentConciergeLauncher} from "./components/ResidentConciergeLauncher";
import {PublicLanding} from "./components/PublicLanding";
import {PublicAuth} from "./components/PublicAuth";
import {MaintenanceAccess} from "./components/MaintenanceAccess";
import {MaintenanceAutomationSettings} from "./components/MaintenanceAutomationSettings";
import {MaintenanceApprovalCenter} from "./components/MaintenanceApprovalCenter";
import {NovaOwnerControlLauncher} from "./components/NovaOwnerControlLauncher";
import {VendorJobPortal} from "./components/VendorJobPortal";
import {SubscriptionGate} from "./components/SubscriptionGate";
import {LegalFooter,LegalPageView,type LegalPage} from "./components/LegalPages";
import "./styles/app.css";
import "./styles/tenant-enterprise.css";
import "./styles/landlord-enterprise.css";
import "./styles/public-landing.css";
import "./styles/onboarding.css";
import "./styles/legal.css";

const legalPages:LegalPage[]=["privacy","terms","data","cookies","accessibility"];
const viewTitles:Record<string,string>={overview:"Overview",properties:"Properties",tenants:"Residents & Leases",documents:"Document Vault",money:"Money Chaser",payments:"Payments & Payouts",maintenance:"Maintenance",compliance:"Compliance & Inspections",inbox:"Inbox",vendors:"Vendors",local:"Local Intelligence",ai:"AI Activity",admin:"Admin"};
const legalTitles:Record<LegalPage,string>={privacy:"Privacy Policy",terms:"Terms of Service",data:"Data & Security",cookies:"Cookie Policy",accessibility:"Accessibility"};

function Root(){
  const[ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSignedIn(Boolean(data.session));setReady(true)});
    const{data}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session)));
    return()=>data.subscription.unsubscribe();
  },[]);
  const params=new URLSearchParams(location.search),legal=params.get("legal") as LegalPage|null;
  const auth=params.get("auth");
  const portal=params.get("portal");
  const vendorJob=params.get("vendorJob");
  const view=params.get("view");
  useEffect(()=>{
    let page="AI Property Operations for Landlords & Property Managers";
    if(vendorJob)page="Vendor Job";
    else if(legal&&legalPages.includes(legal))page=legalTitles[legal];
    else if(auth==="signup")page="Create Account";
    else if(auth==="login")page="Sign In";
    else if(auth==="resident")page="Resident Sign In";
    else if(auth==="maintenance")page="Maintenance Access";
    else if(view&&viewTitles[view])page=viewTitles[view];
    document.title=`${page} | Mendlyx`;
  },[legal,auth,view,vendorJob]);
  if(vendorJob)return <VendorJobPortal token={vendorJob}/>;
  if(!ready)return <div className="loading-screen">Loading Mendlyx...</div>;
  const wantsWorkspace=params.has("view")||params.get("app")==="1"||portal==="resident"||portal==="maintenance";
  if(legal&&legalPages.includes(legal))return <LegalPageView page={legal} onBack={()=>location.href="/"}/>;
  if(auth==="maintenance")return <div className="rp-public-frame"><MaintenanceAccess/><LegalFooter/></div>;
  if(auth==="signup"||auth==="login")return <div className="rp-public-frame"><PublicAuth initial={auth}/><LegalFooter/></div>;
  if(auth==="resident")return <div className="rp-public-frame"><PublicAuth initial="login" residentLogin/><LegalFooter/></div>;
  if(wantsWorkspace){
    if(!signedIn)return <div className="rp-public-frame"><PublicAuth initial="login" residentLogin={portal==="resident"}/><LegalFooter/></div>;
    return <SubscriptionGate><div className="rp-app-frame"><App/><MaintenanceAutomationSettings/><MaintenanceApprovalCenter/><NovaOwnerControlLauncher/><LegalFooter/><ResidentConciergeLauncher/></div></SubscriptionGate>;
  }
  return <PublicLanding onStart={()=>location.href="/?auth=signup"} onSignIn={()=>location.href="/?auth=login"} onResidentSignIn={()=>location.href="/?auth=resident"}/>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode><Root/></React.StrictMode>);
