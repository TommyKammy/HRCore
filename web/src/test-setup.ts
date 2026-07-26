import "@testing-library/jest-dom/vitest";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});
