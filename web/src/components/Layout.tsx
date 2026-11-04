import type { ReactNode } from "react";
import { t } from "../i18n";
import { Link } from "../router";
import { useSession } from "../session";
import { ConnectionBanner } from "./ConnectionBanner";

export function Page({ title, children }: { title: string; children: ReactNode }) {
  const { displayName } = useSession();
  return (
    <>
      <ConnectionBanner />
      <header className="topbar">
        <Link to="/" className="brand">
          Jesters
        </Link>
        {displayName && (
          <Link to="/profile" className="profile-link">
            <span aria-hidden="true">👤 </span>
            {displayName}
          </Link>
        )}
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
      <footer>
        <Link to="/privacy">{t("Privacy policy")}</Link>
      </footer>
    </>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

/** Shown while something is on its way from the server. */
export function Loading() {
  return (
    <p className="hint loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {t("Loading…")}
    </p>
  );
}
