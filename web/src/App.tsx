import { Page } from "./components/Layout";
import { t } from "./i18n";
import { Game } from "./pages/Game";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { NameScreen } from "./pages/NameScreen";
import { Privacy } from "./pages/Privacy";
import { Profile } from "./pages/Profile";
import { Transfer } from "./pages/Transfer";
import { useNotificationSetup } from "./notifications";
import { Link, useRoute } from "./router";
import { useSession } from "./session";

export function App() {
  const route = useRoute();
  const session = useSession();
  useNotificationSetup(session.uid);

  if (route.page === "privacy") return <Privacy />;
  // Also before choosing a name: a guest moving here keeps theirs.
  if (route.page === "transfer") return <Transfer />;
  if (!session.displayName) return <NameScreen onSubmit={session.setDisplayName} />;
  if (!session.uid) {
    return (
      <Page title="">
        {session.signInFailed ? (
          <>
            <h2>{t("No connection")}</h2>
            <p>{t("Could not connect to the server. Check your internet connection.")}</p>
            <button onClick={session.retrySignIn}>{t("Try again")}</button>
          </>
        ) : (
          <p className="hint">{t("Loading…")}</p>
        )}
      </Page>
    );
  }

  switch (route.page) {
    case "home":
      return <Home uid={session.uid} />;
    case "join":
      return <Join key={route.key} initialKey={route.key} />;
    case "game":
      return <Game key={route.gameId} gameId={route.gameId} uid={session.uid} />;
    case "profile":
      return <Profile />;
    case "notFound":
      return (
        <Page title={t("Page not found")}>
          <Link to="/">{t("Back to your games")}</Link>
        </Page>
      );
  }
}
