import React,{useEffect,useState} from "react";
import ReactDOM from "react-dom/client";
import "./lib/leaseVisionFetchPatch";
import App from "./App";
import {supabase} from "./lib/supabase";
import {ResidentConciergeLauncher} from "./components/ResidentConciergeLauncher";
import {PublicLanding} from "./components/PublicLanding";
import {PublicAuth} from "./components/PublicAuth";
import {SubscriptionGate} from "./components/SubscriptionGate";
import {LegalFooter,LegalPageView,type LegalPage} from "./components/LegalPages";
import "./styles/app.css";
import "./styles/tenant-enterprise.css";
import "./styles/landlord-enterprise.css";
import "./styles/public-landing.css";
import "./styles/onboarding.css";
import "./styles/legal.css";

const legalPages:LegalPage[]=["privacy","terms","data","cookies","accessibility"];

function Root(){
  const[ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSignedIn(Boolean(data.session));setReady(true)});
    const{data}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session)));
    return()=>data.subscription.unsubscribe();
  },[]);
  if(!ready)return <div className="loading-screen">Loading RentPilot...</div>;
  const params=new URLSearchParams(location.search),legal=params.get("legal") as LegalPage|null;
  const showLanding=params.get("landing")==="1";
  if(legal&&legalPages.includes(legal))return <LegalPageView page={legal} onBack={()=>location.href=signedIn?"/?view=overview":"/"}/>;
  if(showLanding)return <PublicLanding onStart={()=>location.href="/?auth=signup"} onSignIn={()=>location.href=signedIn?"/?view=overview":"/?auth=login"}/>;
  if(signedIn)return <SubscriptionGate><div className="rp-app-frame"><App/><LegalFooter/><ResidentConciergeLauncher/></div></SubscriptionGate>;
  const auth=params.get("auth");
  if(auth==="signup"||auth==="login")return <div className="rp-public-frame"><PublicAuth initial={auth}/><LegalFooter/></div>;
  return <PublicLanding onStart={()=>location.href="/?auth=signup"} onSignIn={()=>location.href="/?auth=login"}/>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode><Root/></React.StrictMode>);
