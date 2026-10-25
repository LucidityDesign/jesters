import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initFirebase } from "./firebase";
import { lang } from "./i18n";
import { SessionProvider } from "./session";
import "./styles.css";

document.documentElement.lang = lang;
await initFirebase();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
