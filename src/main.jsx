import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { session } from "./fieldwork.js";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
