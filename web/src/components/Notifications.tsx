import { t } from "../i18n";
import { useNotifications } from "../notifications";
import { ErrorText } from "./Layout";

const FAILED = () => t("Could not turn on notifications.");
const HOME_SCREEN = () =>
  t(
    "To get notifications on iPhone or iPad, add Jesters to your Home Screen (Share → Add to Home Screen) and open it from there. You start there as a new guest.",
  );

/** On the home screen: an offer to turn notifications on, until the player decides. */
export function NotificationOffer({ uid }: { uid: string }) {
  const notifications = useNotifications(uid);
  if (!notifications.offer && !notifications.failed) return null;
  if (notifications.state === "homeScreen") {
    return (
      <div className="notice">
        <p>
          <span aria-hidden="true">🔔 </span>
          {HOME_SCREEN()}
        </p>
        <div className="actions">
          <button onClick={notifications.dismiss}>{t("OK")}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="notice">
      <p>
        <span aria-hidden="true">🔔 </span>
        {t("Get a notification when it's your turn.")}
      </p>
      <div className="actions">
        <button className="primary" onClick={notifications.turnOn} disabled={notifications.isBusy}>
          {t("Turn on")}
        </button>
        <button onClick={notifications.dismiss}>{t("Not now")}</button>
      </div>
      <ErrorText message={notifications.failed ? FAILED() : null} />
    </div>
  );
}

/** On the profile: whether notifications are on, and a switch. */
export function NotificationSettings({ uid }: { uid: string }) {
  const notifications = useNotifications(uid);
  const { state, isBusy } = notifications;
  if (state === null) return null;
  return (
    <section>
      <h2>{t("Notifications")}</h2>
      {state === "on" && (
        <>
          <p>{t("Notifications are on.")}</p>
          <button onClick={notifications.turnOff} disabled={isBusy}>
            {t("Turn off")}
          </button>
        </>
      )}
      {state === "off" && (
        <>
          <p>{t("Get a notification when it's your turn.")}</p>
          <button className="primary" onClick={notifications.turnOn} disabled={isBusy}>
            {t("Turn on")}
          </button>
        </>
      )}
      {state === "blocked" && (
        <p className="hint">
          {t("Notifications are blocked. Allow them for this site in your browser's settings.")}
        </p>
      )}
      {state === "homeScreen" && <p className="hint">{HOME_SCREEN()}</p>}
      {state === "unsupported" && (
        <p className="hint">{t("This browser can't show notifications.")}</p>
      )}
      <ErrorText message={notifications.failed ? FAILED() : null} />
    </section>
  );
}
