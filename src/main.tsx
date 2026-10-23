import React,{useEffect,useState} from "react";
import ReactDOM from "react-dom/client";
import "./lib/leaseVisionFetchPatch";
import App from "./App";
import {supabase} from "./lib/supabase";
import {ResidentConciergeLauncher} from "./components/ResidentConciergeLauncher";
import {PublicLanding} from "./components/PublicLanding";
import {PublicAuth} from "./components/PublicAuth";
import "./styles/app.css";
import "./styles/tenant-enterprise.css";
import "./styles/landlord-enterprise.css";
import "./styles/public-landing.css";
import "./styles/onboarding.css";
function Root(){const[ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false);useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSignedIn(Boolean(data.session));setReady(true)});const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSignedIn(Boolean(s)));return()=>data.subscription.unsubscribe()},[]);if(!ready)return <div className="loading-screen">Loading RentPilot...</div>;if(signedIn)return <><App/><ResidentConciergeLauncher/></>;const auth=new URLSearchParams(location.search).get('auth');if(auth==='signup'||auth==='login')return <PublicAuth initial={auth}/>;return <PublicLanding onStart={()=>location.href='/?auth=signup'} onSignIn={()=>location.href='/?auth=login'}/>}
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode><Root/></React.StrictMode>);
