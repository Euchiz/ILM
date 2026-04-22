import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@ilm/ui";
import { App } from "./App";
import "@ilm/ui/auth.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Could not find root element for Account.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
