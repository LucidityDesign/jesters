import { lang, t } from "../i18n";
import { type Card, cardKind, type Suit } from "../model";

export const SUIT_SYMBOL: Record<Suit, string> = { H: "♥", S: "♠", D: "♦", C: "♣" };

export function suitName(suit: Suit): string {
  return t({ H: "Hearts", S: "Spades", D: "Diamonds", C: "Clubs" }[suit]);
}

const SHORT = {
  en: { 11: "J", 12: "Q", 13: "K", 14: "A", wizard: "W", jester: "J" },
  de: { 11: "B", 12: "D", 13: "K", 14: "A", wizard: "Z", jester: "N" },
} as const;

/** The label on the card face: rank, or W/J for Wizard and Jester (Z/N in German). */
export function rankText(card: Card): string {
  const kind = cardKind(card);
  const short = SHORT[lang];
  if (kind.type !== "regular") return short[kind.type];
  return kind.rank >= 11 ? short[kind.rank as 11 | 12 | 13 | 14] : String(kind.rank);
}

/** The full name for screen readers, e.g. "Queen of Hearts". */
export function cardName(card: Card): string {
  const kind = cardKind(card);
  if (kind.type === "wizard") return t("Wizard");
  if (kind.type === "jester") return t("Jester");
  const names: Record<number, string> = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
  const rank = names[kind.rank] ? t(names[kind.rank] as string) : String(kind.rank);
  return t("{rank} of {suit}", { rank, suit: suitName(kind.suit) });
}

/**
 * A simple card face: rank and suit symbol in the suit's color (four-color deck). Wizards and
 * Jesters have a tinted face and, unless small, their name, so a Jester never looks like a Jack.
 */
export function CardView({ card, small = false }: { card: Card; small?: boolean }) {
  const kind = cardKind(card);
  const color = kind.type === "regular" ? kind.suit : kind.type;
  return (
    <span
      className={`card card-${color}${small ? " card-small" : ""}`}
      role="img"
      aria-label={cardName(card)}
    >
      <span aria-hidden="true">{rankText(card)}</span>
      {kind.type === "regular" ? (
        <span aria-hidden="true">{SUIT_SYMBOL[kind.suit]}</span>
      ) : (
        !small && (
          <span className="card-caption" aria-hidden="true">
            {cardName(card)}
          </span>
        )
      )}
    </span>
  );
}
