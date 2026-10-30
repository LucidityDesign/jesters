import { type FormEvent, useState } from "react";
import { ErrorText, Page } from "../components/Layout";
import { useMyGames } from "../hooks";
import { t } from "../i18n";
import { navigate } from "../router";
import { useSession } from "../session";
import { useAction } from "../useAction";

/**
 * Moves the guest from another device here: enter the code shown there (also taken from the link
 * of its QR code, `/transfer#CODE`).
 */
export function Transfer() {
  const session = useSession();
  const [code, setCode] = useState(() => decodeURIComponent(location.hash.slice(1)));
  const action = useAction();

  async function moveHere(hasGames: boolean) {
    if (
      hasGames &&
      !window.confirm(
        `${t("Move here?")}\n\n${t("The games you play on this device stay with the guest you are here now, and you can't get back to them.")}`,
      )
    ) {
      return;
    }
    if (await action.run(() => session.moveHere(code))) navigate("/", { replace: true });
  }

  return (
    <Page title={t("Move to this device")}>
      <p>
        {t(
          "On the device you play on now, open your profile, choose “Show transfer code” and enter the code here.",
        )}
      </p>
      {session.uid ? (
        <TransferForm
          uid={session.uid}
          code={code}
          onChange={setCode}
          disabled={action.isSending}
          onSubmit={moveHere}
        />
      ) : (
        <p className="hint">{t("Loading…")}</p>
      )}
      <ErrorText message={action.error} />
    </Page>
  );
}

function TransferForm({
  uid,
  code,
  onChange,
  disabled,
  onSubmit,
}: {
  uid: string;
  code: string;
  onChange(code: string): void;
  disabled: boolean;
  onSubmit(hasGames: boolean): void;
}) {
  const games = useMyGames(uid);
  const hasGames = (games ?? []).some((entry) => entry.game.active);
  const filled = code.replace(/[\s-]/g, "").length >= 8;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (filled) onSubmit(hasGames);
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{t("Transfer code")}</span>
        <input
          className="code-input"
          value={code}
          onChange={(event) => onChange(event.target.value)}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          placeholder="K7Q2-XM4P"
          autoFocus
        />
      </label>
      <button type="submit" className="primary" disabled={disabled || !filled}>
        {t("Move here")}
      </button>
    </form>
  );
}
