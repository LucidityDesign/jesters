import { type FormEvent, useState } from "react";
import { t } from "../i18n";
import { Link } from "../router";

export const MAX_NAME_LENGTH = 24;

export function NameForm({
  initialName,
  submitLabel,
  onSubmit,
}: {
  initialName: string;
  submitLabel: string;
  onSubmit(name: string): void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isValid) onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{t("Your name")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          required
        />
      </label>
      <button type="submit" className="primary" disabled={!isValid}>
        {submitLabel}
      </button>
    </form>
  );
}

/** First visit: asks for the display name. */
export function NameScreen({ onSubmit }: { onSubmit(name: string): void }) {
  return (
    <main className="welcome">
      <img src="/icon-192.png" alt="" width={96} height={96} />
      <h1>{t("Welcome to Jesters")}</h1>
      <NameForm initialName="" submitLabel={t("Let's play")} onSubmit={onSubmit} />
      <p>
        <Link to="/transfer">{t("I already play on another device")}</Link>
      </p>
      <p className="hint">
        {t(
          "You play as a guest. Your games are linked to this browser and are lost if you clear its site data.",
        )}
      </p>
      <p className="hint">
        <Link to="/privacy">{t("Privacy policy")}</Link>
      </p>
    </main>
  );
}
