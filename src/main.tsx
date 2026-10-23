import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/leaseVisionFetchPatch";
import App from "./App";
import {ResidentConciergeLauncher} from "./components/ResidentConciergeLauncher";

// Global styles
import "./styles/app.css";
import "./styles/tenant-enterprise.css";
import "./styles/landlord-enterprise.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <ResidentConciergeLauncher />
  </React.StrictMode>
);
