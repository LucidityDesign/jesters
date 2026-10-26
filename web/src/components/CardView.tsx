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

/** A wizard's hat with stars, the face of a Wizard. */
function WizardHat() {
  return (
    <svg viewBox="0 0 32 32" className="card-art" aria-hidden="true">
      <path d="M17 2 L25 24 H7 Z" fill="currentColor" />
      <ellipse cx="16" cy="25" rx="14" ry="3.5" fill="currentColor" />
      <path
        d="M15 11 l1 2.2 2.2 .3 -1.6 1.5 .4 2.2 -2-1.1 -2 1.1 .4-2.2 -1.6-1.5 2.2-.3 Z"
        fill="var(--wizard-face)"
      />
      <circle cx="18.5" cy="19.5" r="1.2" fill="var(--wizard-face)" />
    </svg>
  );
}

/** A jester's cap with three bells, the face of a Jester. */
function JesterCap() {
  return (
    <svg viewBox="0 0 32 32" className="card-art" aria-hidden="true">
      <path d="M13 23 C11 12 6 7 2 12 C6 12 8 17 7 23 Z" fill="currentColor" />
      <path d="M12 23 C13 13 15 7 16 4 C17 7 19 13 20 23 Z" fill="currentColor" opacity="0.6" />
      <path d="M19 23 C21 12 26 7 30 12 C26 12 24 17 25 23 Z" fill="currentColor" />
      <rect x="6" y="22" width="20" height="5" rx="2" fill="currentColor" />
      <circle cx="2.5" cy="14.5" r="2" fill="currentColor" />
      <circle cx="16" cy="3.5" r="2" fill="currentColor" />
      <circle cx="29.5" cy="14.5" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * A card face in the suit's color (four-color deck): rank and suit in the corner, so overlapping
 * cards stay readable, and a large suit symbol in the middle. Wizards and Jesters have a tinted
 * face with a hat or cap and, unless small, their name, so a Jester never looks like a Jack.
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
      <span className="card-index" aria-hidden="true">
        <span>{rankText(card)}</span>
        {kind.type === "regular" && <span>{SUIT_SYMBOL[kind.suit]}</span>}
      </span>
      {!small && (
        <span className="card-pip" aria-hidden="true">
          {kind.type === "regular" ? (
            SUIT_SYMBOL[kind.suit]
          ) : kind.type === "wizard" ? (
            <WizardHat />
          ) : (
            <JesterCap />
          )}
        </span>
      )}
      {!small && kind.type !== "regular" && (
        <span className="card-caption" aria-hidden="true">
          {cardName(card)}
        </span>
      )}
    </span>
  );
}
