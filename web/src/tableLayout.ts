// Where the cards of a trick go on the table, so that no card covers the corner of another (rank
// and suit) and no seat covers a card's corner, on any screen. Cards further down lie on top, so
// a card only hides the bottom of the cards above it, never their corners.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A trick card at full size (see `.card`), and its corner with rank and suit. */
export const TRICK_CARD = { width: 56, height: 80, corner: { x: 3, y: 3, width: 22, height: 38 } };

/**
 * How far from the middle towards the seats the cards lie, sideways and up and down (1 = the rim),
 * and their size.
 */
export interface TrickLayout {
  reachX: number;
  reachY: number;
  scale: number;
}

export const DEFAULT_TRICK_LAYOUT: TrickLayout = { reachX: 0.42, reachY: 0.42, scale: 1 };

const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.6];
const REACHES = [0.22, 0.26, 0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.54, 0.58];
/** For each size, the spreads to try, still roughly round: closest to the usual one first. */
const SPREADS = REACHES.flatMap((reachX) => REACHES.map((reachY) => ({ reachX, reachY })))
  .filter(({ reachX, reachY }) => Math.abs(reachX - reachY) <= 0.16)
  .sort((a, b) => spreadDistance(a) - spreadDistance(b));

function spreadDistance({ reachX, reachY }: { reachX: number; reachY: number }): number {
  return Math.hypot(reachX - DEFAULT_TRICK_LAYOUT.reachX, reachY - DEFAULT_TRICK_LAYOUT.reachY);
}
const GAP = 2;

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + GAP &&
    b.x < a.x + a.width + GAP &&
    a.y < b.y + b.height + GAP &&
    b.y < a.y + a.height + GAP
  );
}

/** Where a card's middle lies, in percent of the felt, for the seat in `direction`. */
export function trickCardPosition(
  direction: { x: number; y: number },
  { reachX, reachY }: TrickLayout,
): { x: number; y: number } {
  return { x: 50 + 50 * reachX * direction.x, y: 50 + 50 * reachY * direction.y };
}

/** The card's box on the felt, for the seat in `direction`. */
export function trickCardBox(
  felt: { width: number; height: number },
  direction: { x: number; y: number },
  layout: TrickLayout,
): Box {
  const width = TRICK_CARD.width * layout.scale;
  const height = TRICK_CARD.height * layout.scale;
  const { x, y } = trickCardPosition(direction, layout);
  return {
    x: (x / 100) * felt.width - width / 2,
    y: (y / 100) * felt.height - height / 2,
    width,
    height,
  };
}

/** The stacking order of the cards: further down on top, then further right. */
export function trickCardLayers(directions: readonly { x: number; y: number }[]): number[] {
  const order = directions
    .map((direction, index) => ({ ...direction, index }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const layers = Array<number>(directions.length);
  for (const [layer, { index }] of order.entries()) layers[index] = layer;
  return layers;
}

/**
 * How many card corners are hidden by another card or a seat, or stick out of the felt, and
 * whether the cards lie apart, clear of each other and of the seats.
 */
function check(
  felt: { width: number; height: number },
  seats: readonly Box[],
  directions: readonly { x: number; y: number }[],
  layout: TrickLayout,
): { hidden: number; apart: boolean } {
  const cards = directions.map((direction) => trickCardBox(felt, direction, layout));
  const layers = trickCardLayers(directions);
  let hidden = 0;
  let apart = true;
  cards.forEach((card, index) => {
    const { corner } = TRICK_CARD;
    const box: Box = {
      x: card.x + corner.x * layout.scale,
      y: card.y + corner.y * layout.scale,
      width: corner.width * layout.scale,
      height: corner.height * layout.scale,
    };
    const outside =
      box.x < 0 || box.y < 0 || box.x + box.width > felt.width || box.y + box.height > felt.height;
    const covered =
      seats.some((seat) => overlaps(box, seat)) ||
      cards.some(
        (other, otherIndex) =>
          (layers[otherIndex] as number) > (layers[index] as number) && overlaps(box, other),
      );
    if (outside || covered) hidden++;
    if (
      seats.some((seat) => overlaps(card, seat)) ||
      cards.some((other, otherIndex) => otherIndex !== index && overlaps(card, other))
    ) {
      apart = false;
    }
  });
  return { hidden, apart };
}

/** Cards lying apart look tidier, as long as they don't get much smaller for it. */
const MIN_SCALE_APART = 0.76;

/**
 * The largest cards, as close to the usual distance as possible, with every card's corner in
 * view; preferably apart from each other. `directions` points from the middle of the felt towards
 * each seat (y down); `seats` are the seats' boxes on the felt. If nothing fits, the layout hiding
 * the fewest corners.
 */
export function fitTrick(
  felt: { width: number; height: number },
  seats: readonly Box[],
  directions: readonly { x: number; y: number }[],
): TrickLayout {
  let best = { layout: DEFAULT_TRICK_LAYOUT, hidden: Infinity };
  let overlapping: TrickLayout | null = null;
  for (const scale of SCALES) {
    for (const spread of SPREADS) {
      const layout = { ...spread, scale };
      const { hidden, apart } = check(felt, seats, directions, layout);
      if (hidden === 0 && (apart || scale < MIN_SCALE_APART)) return layout;
      if (hidden === 0) overlapping ??= layout;
      if (hidden < best.hidden) best = { layout, hidden };
    }
    if (overlapping && scale <= MIN_SCALE_APART) return overlapping;
  }
  return overlapping ?? best.layout;
}
