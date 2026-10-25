import { useState } from "react";
import { errorMessage } from "../api";
import { ErrorText, Page } from "../components/Layout";
import { t } from "../i18n";
import { Link, navigate } from "../router";
import { useSession } from "../session";
import { NameForm } from "./NameScreen";

/** Change the name, read the privacy policy or delete all data. */
export function Profile() {
  const session = useSession();
  const [saved, setSaved] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteMyData() {
    if (
      !window.confirm(
        `${t("Delete all your data?")}\n\n${t("Your running games end for everyone. This can't be undone.")}`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await session.deleteMyData();
      navigate("/", { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
      setDeleting(false);
    }
  }

  return (
    <Page title={t("Profile")}>
      <NameForm
        initialName={session.displayName}
        submitLabel={t("Save")}
        onSubmit={(name) => {
          session.setDisplayName(name);
          setSaved(true);
        }}
      />
      {saved && <p role="status">{t("Saved")}</p>}

      <section>
        <h2>{t("Privacy")}</h2>
        <p>
          <Link to="/privacy">{t("Privacy policy")}</Link>
        </p>
        <button className="danger" onClick={deleteMyData} disabled={isDeleting}>
          {t("Delete my data")}
        </button>
        <ErrorText message={error} />
        <p className="hint">
          {t(
            "Deleting your data ends your running games, removes your name from finished games and deletes your guest account. You then start over as a new guest.",
          )}
        </p>
      </section>
    </Page>
  );
}
