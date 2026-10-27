import { useEffect, useState } from "react";
import { useConnected } from "../connection";
import { t } from "../i18n";

/** Short drops are not worth a warning. */
const SHOW_AFTER_MS = 1500;
const SHOW_RECONNECTED_FOR_MS = 2500;

/** A bar at the top while the connection is down, and briefly once it is back. */
export function ConnectionBanner() {
  const connected = useConnected();
  const [lost, setLost] = useState(false);
  const [reconnected, setReconnected] = useState(false);

  if (connected && lost) {
    setLost(false);
    setReconnected(true);
  }

  useEffect(() => {
    if (connected) return;
    const timer = setTimeout(() => setLost(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    if (!reconnected) return;
    const timer = setTimeout(() => setReconnected(false), SHOW_RECONNECTED_FOR_MS);
    return () => clearTimeout(timer);
  }, [reconnected]);

  return (
    <div className="connection-region" aria-live="polite">
      {lost && (
        <p className="connection connection-lost">
          <span className="connection-dot" aria-hidden="true" />
          {t("Connection lost. Reconnecting…")}
        </p>
      )}
      {reconnected && !lost && (
        <p className="connection connection-back">
          <span className="connection-dot" aria-hidden="true" />
          {t("Connected again")}
        </p>
      )}
    </div>
  );
}
