import { useState } from "react";
import { errorMessage } from "./api";

/** Runs one server call at a time and keeps its error message for the player. */
export function useAction() {
  const [isSending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns whether the action succeeded. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (isSending) return false;
    setSending(true);
    try {
      await action();
      setError(null);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setSending(false);
    }
  }
  return { isSending, error, run };
}
