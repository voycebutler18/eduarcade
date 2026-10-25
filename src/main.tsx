import React,{lazy,Suspense,useEffect,useState} from "react";
import ReactDOM from "react-dom/client";
import type {Session} from "@supabase/supabase-js";
import "./lib/leaseVisionFetchPatch";
import {supabase} from "./lib/supabase";
import "./styles/app.css";
import "./styles/tenant-enterprise.css";
import "./styles/landlord-enterprise.css";
import "./styles/public-landing.css";
import "./styles/onboarding.css";
import "./styles/legal.css";
import "./styles/settings.css";

const App=lazy(()=>import("./App"));
const ResidentConciergeLauncher=lazy(()=>import("./components/ResidentConciergeLauncher").then(m=>({default:m.ResidentConciergeLauncher})));
const PublicLanding=lazy(()=>import("./components/PublicLanding").then(m=>({default:m.PublicLanding})));
const PublicAuth=lazy(()=>import("./components/PublicAuth").then(m=>({default:m.PublicAuth})));
const MaintenanceAccess=lazy(()=>import("./components/MaintenanceAccess").then(m=>({default:m.MaintenanceAccess})));
const MaintenanceAutomationSettings=lazy(()=>import("./components/MaintenanceAutomationSettings").then(m=>({default:m.MaintenanceAutomationSettings})));
const MaintenanceApprovalCenter=lazy(()=>import("./components/MaintenanceApprovalCenter").then(m=>({default:m.MaintenanceApprovalCenter})));
const NovaOwnerControlLauncher=lazy(()=>import("./components/NovaOwnerControlLauncher").then(m=>({default:m.NovaOwnerControlLauncher})));
const VendorJobPortal=lazy(()=>import("./components/VendorJobPortal").then(m=>({default:m.VendorJobPortal})));
const SubscriptionGate=lazy(()=>import("./components/SubscriptionGate").then(m=>({default:m.SubscriptionGate})));
const LegalFooter=lazy(()=>import("./components/LegalPages").then(m=>({default:m.LegalFooter})));
const LegalPageView=lazy(()=>import("./components/LegalPages").then(m=>({default:m.LegalPageView})));
const AccountSettings=lazy(()=>import("./components/AccountSettings").then(m=>({default:m.AccountSettings})));
const CookieConsent=lazy(()=>import("./components/PrivacyControls").then(m=>({default:m.CookieConsent})));
const UnsubscribePage=lazy(()=>import("./components/PrivacyControls").then(m=>({default:m.UnsubscribePage})));

type LegalPage="privacy"|"terms"|"refunds"|"data"|"cookies"|"accessibility";
const legalPages:LegalPage[]=["privacy","terms","refunds","data","cookies","accessibility"];
const viewTitles:Record<string,string>={overview:"Overview",properties:"Properties",tenants:"Residents & Leases",documents:"Document Vault",money:"Money Chaser",payments:"Payments & Payouts",maintenance:"Maintenance",compliance:"Compliance & Inspections",inbox:"Inbox",vendors:"Vendors",local:"Local Intelligence",ai:"AI Activity",admin:"Admin"};
const legalTitles:Record<LegalPage,string>={privacy:"Privacy Policy",terms:"Terms of Service",refunds:"Refund Policy",data:"Your Privacy Choices",cookies:"Cookie Policy",accessibility:"Accessibility"};

function Root(){
  const[ready,setReady]=useState(false),[session,setSession]=useState<Session|null>(null);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});
    const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>data.subscription.unsubscribe();
  },[]);
  const params=new URLSearchParams(location.search),legal=params.get("legal") as LegalPage|null;
  const auth=params.get("auth");
  const portal=params.get("portal");
  const vendorJob=params.get("vendorJob");
  const view=params.get("view");
  const settings=params.get("settings")==="1";
  const unsubscribe=params.get("unsubscribe");
  useEffect(()=>{
    let page="AI Property Operations for Landlords & Property Managers";
    if(unsubscribe)page="Email Preferences";
    else if(settings)page="Settings & Privacy";
    else if(vendorJob)page="Vendor Job";
    else if(legal&&legalPages.includes(legal))page=legalTitles[legal];
    else if(auth==="signup")page="Create Account";
    else if(auth==="login")page="Sign In";
    else if(auth==="resident")page="Resident Sign In";
    else if(auth==="maintenance")page="Maintenance Access";
    else if(view&&viewTitles[view])page=viewTitles[view];
    document.title=`${page} | Mendlyx`;
  },[legal,auth,view,vendorJob,settings,unsubscribe]);
  if(vendorJob)return <><VendorJobPortal token={vendorJob}/><CookieConsent/></>;
  if(!ready)return <div className="loading-screen">Loading Mendlyx...</div>;
  if(unsubscribe)return <><UnsubscribePage token={unsubscribe}/><CookieConsent/></>;
  if(legal&&legalPages.includes(legal))return <><LegalPageView page={legal} onBack={()=>location.href="/"}/><CookieConsent/></>;
  if(settings){if(!session)return <><div className="rp-public-frame"><PublicAuth initial="login"/><LegalFooter/></div><CookieConsent/></>;return <><AccountSettings session={session}/><CookieConsent/></>}
  const wantsWorkspace=params.has("view")||params.get("app")==="1"||portal==="resident"||portal==="maintenance";
  if(auth==="maintenance")return <><div className="rp-public-frame"><MaintenanceAccess/><LegalFooter/></div><CookieConsent/></>;
  if(auth==="signup"||auth==="login")return <><div className="rp-public-frame"><PublicAuth initial={auth}/><LegalFooter/></div><CookieConsent/></>;
  if(auth==="resident")return <><div className="rp-public-frame"><PublicAuth initial="login" residentLogin/><LegalFooter/></div><CookieConsent/></>;
  if(wantsWorkspace){
    if(!session)return <><div className="rp-public-frame"><PublicAuth initial="login" residentLogin={portal==="resident"}/><LegalFooter/></div><CookieConsent/></>;
    return <><SubscriptionGate><div className="rp-app-frame"><App/><MaintenanceAutomationSettings/><MaintenanceApprovalCenter/><NovaOwnerControlLauncher/><a className="global-settings-btn" href="/?settings=1">Settings & Privacy</a><LegalFooter/><ResidentConciergeLauncher/></div></SubscriptionGate><CookieConsent/></>;
  }
  return <><PublicLanding onStart={()=>location.href="/?auth=signup"} onSignIn={()=>location.href="/?auth=login"} onResidentSignIn={()=>location.href="/?auth=resident"}/><CookieConsent/></>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode><Suspense fallback={<div className="loading-screen">Loading Mendlyx...</div>}><Root/></Suspense></React.StrictMode>);
