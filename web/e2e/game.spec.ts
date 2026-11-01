import { type Browser, expect, type Page, test } from "@playwright/test";

/** A guest in their own browser context (own storage, so their own anonymous account). */
async function guest(browser: Browser, name: string, path = "/"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Let's play" }).click();
  return page;
}

/** Makes one move if it is this player's turn; returns whether it did. */
async function moveIfMyTurn(page: Page): Promise<boolean> {
  const banner = page.getByRole("status");
  // The banner alone doesn't show progress: a trick's winner leads the next trick.
  const state = async () =>
    `${await banner.textContent({ timeout: 1_000 }).catch(() => "")}|${await page.locator(".hand-card").count()}`;
  const before = await state();
  const text = before.split("|")[0] as string;
  if (text.includes("Choose trump")) {
    await page
      .locator(".trump-picker")
      .getByRole("button", { name: "Hearts", exact: true })
      .click();
  } else if (text.includes("How many tricks")) {
    await page.locator(".bids button:enabled").first().click();
  } else if (text.startsWith("Your turn")) {
    const card = page.locator(".hand-card:enabled").first();
    await card.click();
    await card.click();
  } else {
    return false;
  }
  // The emulated functions can take a few seconds to answer, above all the first call of a kind.
  await expect.poll(state, { timeout: 15_000 }).not.toBe(before);
  return true;
}

test("three guests create, join and play the first two rounds", async ({ browser }) => {
  const anna = await guest(browser, "Anna");
  await anna.getByRole("button", { name: "New game" }).click();
  await expect(anna.getByRole("heading", { name: "Lobby" })).toBeVisible();
  const roomKey = (await anna.locator(".room-key strong").textContent()) as string;
  expect(roomKey).toMatch(/^[A-Z2-9]{6}$/);

  // Ben joins with the key, Cleo through an invite link.
  const ben = await guest(browser, "Ben");
  await ben.getByRole("link", { name: "Join with key" }).click();
  await ben.getByLabel("Room key").fill(roomKey.toLowerCase());
  await ben.getByRole("button", { name: "Join", exact: true }).click();
  const cleo = await guest(browser, "Cleo", `/join/${roomKey}`);
  await cleo.getByRole("button", { name: "Join", exact: true }).click();

  await expect(anna.getByRole("heading", { name: "Players (3 of 6)" })).toBeVisible();
  await expect(ben.getByText("Waiting for the host to start the game.")).toBeVisible();
  // Reactions work in the lobby too: they float over the sender's name.
  await ben.getByRole("button", { name: "React" }).click();
  await ben.getByRole("button", { name: "👍" }).click();
  await expect(
    anna.locator(".lobby-name", { hasText: "Ben" }).getByRole("img", { name: "👍" }),
  ).toBeVisible();
  // The host may let stalling cost points; everyone sees the rule.
  // The box shows the server's state, so it changes once the server has it.
  await anna.getByLabel("−5 points for stalling").click();
  await expect(anna.getByLabel("−5 points for stalling")).toBeChecked();
  await expect(ben.getByLabel("−5 points for stalling")).toBeChecked();
  await anna.getByRole("button", { name: "Start game" }).click();

  const players = [anna, ben, cleo];
  for (const page of players) {
    await expect(page.getByRole("heading", { name: "Round 1 of 20" })).toBeVisible();
  }

  // An emoji reaction floats over the sender's seat for everyone.
  await anna.getByRole("button", { name: "React" }).click();
  await anna.getByRole("button", { name: "🎉" }).click();
  for (const page of players) {
    await expect(
      page.locator(".seat", { hasText: "Anna" }).getByRole("img", { name: "🎉" }),
    ).toBeVisible();
  }

  // Play until round 3 starts: every round is dealt, bid, played and scored.
  for (let moves = 0; moves < 40; moves++) {
    if (await anna.getByRole("heading", { name: "Round 3 of 20" }).isVisible()) break;
    let moved = false;
    for (const page of players) moved = (await moveIfMyTurn(page)) || moved;
    expect(moved, "someone must be able to move").toBe(true);
  }
  await expect(anna.getByRole("heading", { name: "Round 3 of 20" })).toBeVisible();

  await anna.getByText("Scores").click();
  await expect(anna.locator(".score-sheet tbody tr")).toHaveCount(2);

  // At the start of round 3, the look back shows round 2's last trick and how round 2 went.
  await ben.getByRole("button", { name: "Last trick and round" }).click();
  const lookBack = ben.getByRole("region", { name: "Last trick and round" });
  await expect(lookBack.locator(".look-back-trick li")).toHaveCount(3);
  await expect(lookBack.locator(".look-back-winner")).toHaveCount(1);
  await expect(lookBack.getByText(/won the last trick/)).toBeVisible();
  await expect(lookBack.getByRole("heading", { name: "Round 2" })).toBeVisible();
  await expect(lookBack.locator("tbody tr")).toHaveCount(3);
  await ben.screenshot({});

  // The home screen lists the game.
  const oldGame = anna.url();
  await ben.getByRole("link", { name: "Jesters" }).click();
  await expect(ben.getByRole("link", { name: /Anna, Ben/ })).toBeVisible();

  // When Cleo leaves, a bot takes over her seat and the game goes on.
  cleo.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("A bot will play your seat");
    return dialog.accept();
  });
  await cleo.getByRole("button", { name: "Leave game" }).click();
  await expect(
    anna.locator(".seat", { hasText: "Cleo" }).getByTitle("Left the game · a bot plays"),
  ).toBeVisible();
  await expect(cleo.getByRole("link", { name: /You left · a bot plays for you/ })).toBeVisible();

  // Once no person is left playing, the game ends.
  await ben.goto(oldGame);
  ben.once("dialog", (dialog) => dialog.accept());
  await ben.getByRole("button", { name: "Leave game" }).click();
  await expect(
    anna.locator(".seat", { hasText: "Ben" }).getByTitle("Left the game · a bot plays"),
  ).toBeVisible();
  anna.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Leave and end the game for everyone?");
    return dialog.accept();
  });
  await anna.getByRole("button", { name: "Leave game" }).click();
  await anna.goto(oldGame);
  await expect(anna.getByText("Anna left, so the game ended early.")).toBeVisible();

  // Anna wants to play again and opens a new lobby; Ben joins it from the old game.
  await anna.getByRole("button", { name: "Play again" }).click();
  await expect(anna.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await ben.goto(oldGame);
  await expect(ben.getByText("Anna wants to play again.")).toBeVisible();
  await ben.getByRole("button", { name: "Join the new game" }).click();
  await expect(ben.getByText("Waiting for the host to start the game.")).toBeVisible();
  await expect(anna.getByRole("heading", { name: "Players (2 of 6)" })).toBeVisible();
});

test("a guest plays against two bots", async ({ browser }) => {
  const erik = await guest(browser, "Erik");
  await erik.getByRole("button", { name: "New game" }).click();
  await expect(erik.getByText("Invite friends or add bots.", { exact: false })).toBeVisible();
  await erik.getByRole("button", { name: "Add bot" }).click();
  await expect(erik.locator(".list .hint", { hasText: "Bot (Medium)" })).toHaveCount(1);
  await erik.getByText("Hard", { exact: true }).click();
  await erik.getByRole("button", { name: "Add bot" }).click();
  await expect(erik.getByRole("heading", { name: "Players (3 of 6)" })).toBeVisible();
  await expect(erik.locator(".list .hint", { hasText: "Bot (Hard)" })).toHaveCount(1);
  await erik.getByRole("button", { name: "Start game" }).click();

  await expect(erik.getByRole("heading", { name: "Round 1 of 20" })).toBeVisible();
  await expect(erik.locator(".players .badge", { hasText: "Bot" })).toHaveCount(2);
  // Only Erik ever has to move: the bots answer one after another. Stop as soon as round 3 is
  // dealt, as the bots take a while to start it and the toast about round 2 only shows for 6 s.
  const roundThree = erik.getByRole("heading", { name: "Round 3 of 20" });
  for (let moves = 0; moves < 20; moves++) {
    if (await roundThree.isVisible()) break;
    await expect
      .poll(async () => (await roundThree.isVisible()) || (await moveIfMyTurn(erik)), {
        timeout: 15_000,
      })
      .toBe(true);
  }
  await expect(roundThree).toBeVisible();
  // A toast tells Erik how round 2 went.
  await expect(erik.locator(".toast")).toContainText(/Round 2 · Bid \d, won \d/);
  await expect(erik.locator(".toast")).toContainText(/[+-]?\d+ points/);

  // Restarting the app on the game page opens the game again.
  await erik.reload();
  await expect(roundThree).toBeVisible();

  // Auto-play: a bot plays rounds 3 and 4 for Erik, unless he takes over first.
  await erik.getByRole("button", { name: "Auto-play" }).click();
  await erik.getByRole("button", { name: "Rounds: 2" }).click();
  const bar = erik.locator(".auto-play-bar");
  await expect(bar).toContainText("Auto-play is on · until the end of round 4");
  // Tapping a seat in bot mode tells how long the bot keeps playing.
  await erik.locator(".seat-name-button", { hasText: "Erik" }).click();
  const tip = erik.getByRole("tooltip");
  await expect(tip).toHaveText("Auto-play · until the end of round 4");
  // The tip wraps inside its box, stays on screen, and the seat keeps its size.
  await expect
    .poll(() =>
      tip.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth && box.left >= 0 && box.right <= innerWidth;
      }),
    )
    .toBe(true);
  const nameBox = await erik.locator(".seat-name-button", { hasText: "Erik" }).boundingBox();
  expect(nameBox?.height).toBeLessThan(30);
  await expect(erik.getByRole("heading", { name: "Round 4 of 20" })).toBeVisible({
    timeout: 60_000,
  });
  await bar.getByRole("button", { name: "Take over" }).click();
  await expect(bar).toBeHidden();
});

test("a player removed from the lobby sees that the game is gone", async ({ browser }) => {
  const gus = await guest(browser, "Gus");
  await gus.getByRole("button", { name: "New game" }).click();
  await expect(gus.getByRole("heading", { name: "Lobby" })).toBeVisible();
  const roomKey = (await gus.locator(".room-key strong").textContent()) as string;
  const hana = await guest(browser, "Hana", `/join/${roomKey}`);
  await hana.getByRole("button", { name: "Join", exact: true }).click();
  await expect(hana.getByText("Waiting for the host to start the game.")).toBeVisible();

  await gus.getByRole("button", { name: "Remove: Hana" }).click();
  await expect(hana.getByRole("heading", { name: "Game not available" })).toBeVisible({
    timeout: 3_000,
  });
});

test("shows when the connection is lost and when it is back", async ({ browser }) => {
  const fay = await guest(browser, "Fay");
  await fay.getByRole("button", { name: "New game" }).click();
  await expect(fay.getByRole("heading", { name: "Lobby" })).toBeVisible();

  await fay.context().setOffline(true);
  await expect(fay.getByText("Connection lost. Reconnecting…")).toBeVisible();
  await fay.context().setOffline(false);
  await expect(fay.getByText("Connected again")).toBeVisible({ timeout: 15_000 });
  await expect(fay.getByText("Connected again")).toBeHidden({ timeout: 10_000 });
  await expect(fay.getByRole("heading", { name: "Lobby" })).toBeVisible();
});

test("a guest moves to another device with a transfer code", async ({ browser }) => {
  const anna = await guest(browser, "Anna");
  await anna.getByRole("button", { name: "New game" }).click();
  await expect(anna.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await anna.getByRole("link", { name: "Anna" }).click();
  await anna.getByRole("button", { name: "Show transfer code" }).click();
  const code = (await anna.getByLabel("Transfer code").textContent()) as string;
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(anna.getByRole("img", { name: "QR code" })).toBeVisible();

  // A new device: no name yet, straight to "I already play on another device".
  const phone = await (await browser.newContext()).newPage();
  await phone.goto("/");
  await phone.getByRole("link", { name: "I already play on another device" }).click();
  await phone.getByLabel("Transfer code").fill(code.toLowerCase());
  await phone.getByRole("button", { name: "Move here" }).click();
  await expect(phone.getByRole("link", { name: "Anna", exact: true })).toBeVisible();
  await expect(phone.locator('a[href^="/game/"]')).toHaveCount(1);

  // The code works once.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/transfer#${code}`);
  await other.getByRole("button", { name: "Move here" }).click();
  await expect(other.getByText("This code is wrong or has expired.")).toBeVisible();
});

test("a guest deletes their data and starts over", async ({ browser }) => {
  const dora = await guest(browser, "Dora");
  await dora.getByRole("button", { name: "New game" }).click();
  await expect(dora.getByRole("heading", { name: "Lobby" })).toBeVisible();

  await dora.getByRole("link", { name: "Dora" }).click();
  await expect(dora.getByRole("heading", { name: "Profile" })).toBeVisible();
  dora.once("dialog", (dialog) => dialog.accept());
  await dora.getByRole("button", { name: "Delete my data" }).click();

  await expect(dora.getByRole("heading", { name: "Welcome to Jesters" })).toBeVisible();
  await dora.getByLabel("Your name").fill("Dora");
  await dora.getByRole("button", { name: "Let's play" }).click();
  await expect(dora.getByText("No games yet.", { exact: false })).toBeVisible();
});

test("shows the privacy policy without signing in", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /Privacy Policy/ })).toBeVisible();
});
