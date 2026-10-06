import "./design-system/tokens/colors.css";
import "./design-system/tokens/typography.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { session } from "./fieldwork.ts";

import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
