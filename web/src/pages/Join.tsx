import { type FormEvent, useState } from "react";
import { api } from "../api";
import { ErrorText, Page } from "../components/Layout";
import { t } from "../i18n";
import { navigate } from "../router";
import { useSession } from "../session";
import { useAction } from "../useAction";

/** Join a room by key; `/join/<key>` (an invite link) fills in the key. */
export function Join({ initialKey }: { initialKey: string }) {
  const { displayName } = useSession();
  const [key, setKey] = useState(initialKey.toUpperCase());
  const join = useAction();
  const normalized = key.replace(/\s/g, "").toUpperCase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let gameId = "";
    const joined = await join.run(async () => {
      gameId = (await api.joinRoom(normalized, displayName)).gameId;
    });
    if (joined) navigate(`/game/${gameId}`, { replace: true });
  }

  return (
    <Page title={t("Join game")}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>{t("Room key")}</span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            className="room-key-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            autoFocus={initialKey === ""}
            required
          />
        </label>
        <p className="hint">{t("Ask the host for the 6-character room key.")}</p>
        <button
          type="submit"
          className="primary"
          disabled={normalized.length !== 6 || join.isSending}
        >
          {t("Join")}
        </button>
        <ErrorText message={join.error} />
      </form>
    </Page>
  );
}
