import qrcode from "qrcode-generator";
import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { useAction } from "../useAction";
import { ErrorText } from "./Layout";

/** "K7Q2XM4P" → "K7Q2-XM4P", easier to read and type. */
export function formatTransferCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** The QR code of `text` as SVG modules, drawn in the text color. */
function QrCode({ text }: { text: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return (
    <svg
      className="qr"
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      role="img"
      aria-label={t("QR code")}
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** Profile: shows a code (and its QR code) that moves this guest to another device. */
export function TransferCode() {
  const [shown, setShown] = useState<{ code: string; expiresAt: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, shown.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [shown]);

  async function show() {
    await action.run(async () => {
      setShown(await api.createTransferCode());
      setExpired(false);
    });
  }

  const code = shown && !expired ? formatTransferCode(shown.code) : null;
  return (
    <section>
      <h2>{t("Move to another device")}</h2>
      <p className="hint">
        {t(
          "Play on another phone or browser as the same guest, with your name and games. On the other device, choose “I already play on another device” (or open the link of the QR code) and enter this code. Both devices stay signed in.",
        )}
      </p>
      {code ? (
        <div className="transfer-code">
          <strong className="code" aria-label={t("Transfer code")}>
            {code}
          </strong>
          <QrCode text={`${location.origin}/transfer#${code}`} />
          <p className="hint">{t("Valid for 10 minutes, once.")}</p>
        </div>
      ) : (
        <>
          {expired && <p className="hint">{t("The code has expired.")}</p>}
          <button onClick={show} disabled={action.isSending}>
            {t("Show transfer code")}
          </button>
        </>
      )}
      <ErrorText message={action.error} />
    </section>
  );
}
