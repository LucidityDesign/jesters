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
  await expect.poll(state).not.toBe(before);
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

  // The home screen lists the game; leaving ends it for everyone.
  await ben.getByRole("link", { name: "Jesters" }).click();
  await expect(ben.getByRole("link", { name: /Anna, Ben/ })).toBeVisible();
  cleo.once("dialog", (dialog) => dialog.accept());
  await cleo.getByRole("button", { name: "Leave game" }).click();
  await expect(anna.getByText("Cleo left, so the game ended early.")).toBeVisible();
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
