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

  // The home screen lists the game; leaving ends it for everyone.
  await ben.getByRole("link", { name: "Jesters" }).click();
  await expect(ben.getByRole("link", { name: /Anna, Ben/ })).toBeVisible();
  cleo.once("dialog", (dialog) => dialog.accept());
  await cleo.getByRole("button", { name: "Leave game" }).click();
  await expect(anna.getByText("Cleo left, so the game ended early.")).toBeVisible();
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

  // Auto-play: a bot plays for Erik until he takes over.
  await erik.getByRole("button", { name: "Auto-play" }).click();
  await erik.getByRole("button", { name: "Until I take over" }).click();
  const bar = erik.locator(".auto-play-bar");
  await expect(bar).toContainText("Auto-play is on · until you take over");
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
