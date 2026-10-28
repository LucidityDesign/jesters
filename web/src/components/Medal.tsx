import { t } from "../i18n";

const MEDALS: Record<number, string> = { 1: "👑", 2: "🥈", 3: "🥉" };

/** A crown for the first place, silver and bronze medals for the second and third. */
export function Medal({ place }: { place: number | null }) {
  const medal = place === null ? undefined : MEDALS[place];
  if (!medal) return null;
  const label = t("Place {place}", { place: place as number });
  return (
    <span className="medal" title={label}>
      <span aria-hidden="true">{medal}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
