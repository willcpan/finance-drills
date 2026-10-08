// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { focusAnswer, primeKeyboard } from "./keyboard";

// jsdom has no matchMedia; stand one in that answers the pointer query.
const pointer = (coarse: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse && query.includes("coarse") }));
};

const answerBox = (): HTMLInputElement => {
  const input = document.createElement("input");
  document.body.appendChild(input);
  return input;
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("focusAnswer", () => {
  it("leaves the box unfocused on a phone when no tap raised the keyboard", () => {
    // A focus outside a tap gives iOS a focused box with no keyboard, and a
    // tap on an already-focused box does nothing - so the player had to tap
    // out and back in. Unfocused, one tap brings the keyboard up.
    pointer(true);
    const box = answerBox();

    expect(focusAnswer(box)).toBe(false);
    expect(document.activeElement).not.toBe(box);
  });

  it("hands the keyboard from the stand-in to the box", () => {
    pointer(true);
    primeKeyboard();
    const standIn = document.activeElement as HTMLInputElement;
    expect(standIn.tagName).toBe("INPUT");
    expect(standIn.inputMode).toBe("decimal");

    const box = answerBox();
    expect(focusAnswer(box)).toBe(true);
    expect(document.activeElement).toBe(box);
    // And the stand-in is gone rather than left in the page.
    expect(document.body.contains(standIn)).toBe(false);
  });

  it("keeps the focus a tap already gave the box", () => {
    pointer(true);
    const box = answerBox();
    box.focus();

    expect(focusAnswer(box)).toBe(true);
    expect(document.activeElement).toBe(box);
  });

  it("just focuses the box on a desktop", () => {
    pointer(false);
    const box = answerBox();

    expect(focusAnswer(box)).toBe(true);
    expect(document.activeElement).toBe(box);
  });

  it("raises no stand-in on a desktop", () => {
    pointer(false);
    primeKeyboard();
    expect(document.body.querySelector("input")).toBeNull();
  });
});
