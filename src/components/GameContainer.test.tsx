// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameContainer from "./GameContainer";

// Radix's Select measures layout, which jsdom does not implement. These are the
// two APIs it reaches for; without them the setup screen throws on render.
beforeEach(() => {
  window.localStorage.clear();
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(cleanup);

// Reads the answer the card is looking for out of the revealed feedback, so the
// test never has to reimplement the arithmetic it is checking.
const revealedAnswer = (): string => {
  const line = screen.getByText(/^Answer:/);
  const match = /Answer:\s*\$?(-?[\d.,]+)/.exec(line.textContent ?? "");
  return match?.[1].replace(/,/g, "") ?? "";
};

describe("GameContainer", () => {
  it("renders the setup screen first", () => {
    render(<GameContainer />);
    expect(screen.getByRole("heading", { name: "Finance Drills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /start/i })).toBeTruthy();
  });

  it("plays a full run and reaches the results screen", async () => {
    const user = userEvent.setup();
    render(<GameContainer />);

    await user.click(screen.getByRole("button", { name: /start/i }));

    // Default run length is 10 questions.
    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(new RegExp(`Question ${i + 1} of 10`))).toBeTruthy();

      const input = screen.getByLabelText(/your answer/i);
      await user.type(input, "1");
      await user.click(screen.getByRole("button", { name: /^submit$/i }));

      // Every answer reveals the working, right or wrong.
      expect(screen.getByText(/doing it in your head/i)).toBeTruthy();

      await user.click(
        screen.getByRole("button", { name: i === 9 ? /see results/i : /next question/i })
      );
    }

    await waitFor(() => expect(screen.getByText(/run complete/i)).toBeTruthy());
    expect(screen.getByText(/by question type/i)).toBeTruthy();
  }, 30_000);

  it("marks a correct answer correct and scores it", async () => {
    const user = userEvent.setup();
    render(<GameContainer />);
    await user.click(screen.getByRole("button", { name: /start/i }));

    // Answer wrongly once to reveal the expected value, then restart and use
    // it. The wrong answer has to be wrong for every question type: a near-zero
    // one was inside tolerance whenever a percentage move happened to land
    // near zero, which the month and year moves do regularly.
    await user.type(screen.getByLabelText(/your answer/i), "999999");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    const answer = revealedAnswer();
    expect(answer).not.toBe("");
    expect(screen.getByText(/not quite/i)).toBeTruthy();
  });

  it("can be played entirely from the keyboard", async () => {
    const user = userEvent.setup();
    render(<GameContainer />);
    await user.click(screen.getByRole("button", { name: /start/i }));

    // The input takes focus on its own, so typing needs no click first.
    expect(document.activeElement).toBe(screen.getByLabelText(/your answer/i));

    await user.keyboard("12{Enter}");
    expect(screen.getByText(/doing it in your head/i)).toBeTruthy();

    // Focus moves to Continue once the answer is showing, so Enter carries on.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText(/Question 2 of 10/)).toBeTruthy());

    // And the next question starts with an empty, focused box.
    const input = screen.getByLabelText(/your answer/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("shows the running score in the sidebar", async () => {
    const user = userEvent.setup();
    render(<GameContainer />);
    await user.click(screen.getByRole("button", { name: /start/i }));

    const sidebar = screen.getByRole("heading", { name: "Score" })
      .parentElement?.parentElement as HTMLElement;
    expect(within(sidebar).getByText("Progress")).toBeTruthy();
    expect(within(sidebar).getByText("Accuracy")).toBeTruthy();
    expect(within(sidebar).getByText("1 / 10")).toBeTruthy();
  });

  it("shows saved stats on the setup screen once a run has finished", async () => {
    render(<GameContainer />);
    // Nothing stored yet, so the panel invites a first run.
    expect(screen.getByText(/finish a run/i)).toBeTruthy();
  });
});
