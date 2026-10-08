// Getting the on-screen keyboard up on a phone.
//
// iOS raises the keyboard only for a focus made inside a tap. A focus made any
// other way - from an effect after the screen changes, say - leaves the input
// focused with no keyboard, and tapping an input that is already focused does
// nothing, so the player has to tap out and back in. Two rules follow:
//
// 1. On a touch screen, never focus the answer box outside a tap. Left
//    unfocused, a single tap on it brings the keyboard up.
// 2. Where the box does not exist yet at the moment of the tap (Start, Play
//    again), focus a stand-in input inside the tap to raise the keyboard, and
//    hand focus to the real box once it mounts. Moving focus between inputs
//    while the keyboard is up keeps it up.

let standIn: HTMLInputElement | null = null;

// A phone or tablet, where the keyboard is on screen. matchMedia is absent in
// jsdom, so this is false under test.
export const isTouchScreen = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const removeStandIn = () => {
  standIn?.remove();
  standIn = null;
};

// Call synchronously from the tap that leads to a question.
export const primeKeyboard = (): void => {
  if (!isTouchScreen() || typeof document === "undefined") return;
  removeStandIn();

  const input = document.createElement("input");
  input.type = "text";
  // Same keypad as the answer box, so the keyboard does not change shape on
  // the hand-off.
  input.inputMode = "decimal";
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  // In the viewport (iOS will not focus something far off screen) but
  // invisible; 16px so iOS does not zoom in on focus.
  Object.assign(input.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    border: "0",
    padding: "0",
    fontSize: "16px",
    pointerEvents: "none",
  });
  // If nothing takes the focus over, do not leave it lying around.
  input.addEventListener("blur", removeStandIn, { once: true });

  document.body.appendChild(input);
  input.focus({ preventScroll: true });
  standIn = input;
};

// Focus the answer box for a new question, within the rules above. Returns
// whether it was focused.
export const focusAnswer = (target: HTMLInputElement | null): boolean => {
  if (!target) return false;

  if (standIn) {
    target.focus({ preventScroll: true });
    removeStandIn();
    return true;
  }

  // Already focused inside the tap that moved on (see QuestionCard).
  if (document.activeElement === target) return true;

  // Desktop: no on-screen keyboard to worry about, so just focus it.
  if (!isTouchScreen()) {
    target.focus({ preventScroll: true });
    return true;
  }

  return false;
};
