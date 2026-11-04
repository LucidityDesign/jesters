import { useState } from "react";
import { errorMessage } from "./api";

/** The button the player just pressed, while its click is being handled. */
let pressed: HTMLButtonElement | null = null;
if (typeof document !== "undefined") {
  // Capturing on the document runs before React's own click handlers.
  document.addEventListener(
    "click",
    (event) => {
      pressed = event.target instanceof Element ? event.target.closest("button") : null;
      setTimeout(() => {
        pressed = null;
      });
    },
    true,
  );
}

/**
 * Runs one server call at a time and keeps its error message for the player. The button that
 * started the call is marked busy meanwhile, which shows a spinner on it.
 */
export function useAction() {
  const [isSending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns whether the action succeeded. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (isSending) return false;
    setSending(true);
    const button = pressed;
    button?.setAttribute("aria-busy", "true");
    try {
      await action();
      setError(null);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      button?.removeAttribute("aria-busy");
      setSending(false);
    }
  }
  return { isSending, error, run };
}
