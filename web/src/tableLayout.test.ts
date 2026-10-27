import { describe, expect, it } from "vitest";
import {
  type Box,
  DEFAULT_TRICK_LAYOUT,
  fitTrick,
  TRICK_CARD,
  trickCardBox,
  trickCardLayers,
} from "./tableLayout";

/** Towards each of `count` seats, the player at the bottom, clockwise (as on the table). */
function directions(count: number) {
  return Array.from({ length: count }, (_, seat) => {
    const angle = ((270 - (360 * seat) / count) * Math.PI) / 180;
    return { x: Math.cos(angle), y: -Math.sin(angle) };
  });
}

/** Seats of 100 × 42 px centered on the rim, as the table draws them. */
function seats(felt: { width: number; height: number }, count: number): Box[] {
  return directions(count).map(({ x, y }) => ({
    x: felt.width / 2 + (x * felt.width) / 2 - 50,
    y: felt.height / 2 + (y * felt.height) / 2 - 21,
    width: 100,
    height: 42,
  }));
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("the trick's layout", () => {
  it("keeps the usual layout when there is room", () => {
    const felt = { width: 520, height: 300 };
    expect(fitTrick(felt, seats(felt, 3), directions(3))).toEqual(DEFAULT_TRICK_LAYOUT);
  });

  it("keeps every card's corner in view on a phone with six players", () => {
    for (const felt of [
      { width: 226, height: 286 },
      { width: 256, height: 298 },
      { width: 300, height: 300 },
    ]) {
      const toward = directions(6);
      const seatBoxes = seats(felt, 6);
      const layout = fitTrick(felt, seatBoxes, toward);
      const cards = toward.map((direction) => trickCardBox(felt, direction, layout));
      const layers = trickCardLayers(toward);
      cards.forEach((card, index) => {
        const corner = {
          x: card.x + TRICK_CARD.corner.x * layout.scale,
          y: card.y + TRICK_CARD.corner.y * layout.scale,
          width: TRICK_CARD.corner.width * layout.scale,
          height: TRICK_CARD.corner.height * layout.scale,
        };
        expect(seatBoxes.some((seat) => overlap(corner, seat))).toBe(false);
        const above = cards.filter(
          (_, other) => (layers[other] as number) > (layers[index] as number),
        );
        expect(above.some((other) => overlap(corner, other))).toBe(false);
      });
    }
  });

  it("puts lower cards on top", () => {
    // Bottom, left, top, right.
    expect(
      trickCardLayers(directions(4).map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))),
    ).toEqual([3, 1, 0, 2]);
  });
});
