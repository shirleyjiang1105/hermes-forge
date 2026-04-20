import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "workbenchClient", {
    configurable: true,
    writable: true,
    value: {},
  });
}

if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}
