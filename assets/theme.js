(() => {
  "use strict";
  const root = document.documentElement;
  const key = "prifoxy-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => value === "light" || value === "dark";
  let preference = null;
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  const apply = () => {
    const theme = preference || (system.matches ? "dark" : "light");
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#181a1d" : "#fbfaf5");
    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.title = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
    }
  };
  // Runs before the stylesheet, so the saved palette is used on the first paint.
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try { const saved = localStorage.getItem(key); preference = valid(saved) ? saved : null; } catch {}
    apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
})();
