import React from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "@ilm/ui";
import { App } from "./App";
import "@ilm/ui/auth.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Could not find root element for Funding Manager.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
