(() => {
  "use strict";
  const dialog = document.querySelector(".privacy-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  let opener;
  const open = (trigger) => {
    if (dialog.open) return;
    opener = trigger || document.querySelector("[data-privacy-open]");
    dialog.showModal();
    document.documentElement.classList.add("privacy-is-open");
  };
  document.querySelectorAll("[data-privacy-open]").forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); open(link); });
  });
  dialog.querySelector("[data-privacy-close]").addEventListener("click", () => dialog.close());
  // Only a click that starts and ends on the backdrop closes the dialog.
  let backdropStart = false;
  const outside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  dialog.addEventListener("pointerdown", (event) => { backdropStart = outside(event); });
  dialog.addEventListener("click", (event) => { if (backdropStart && outside(event)) dialog.close(); backdropStart = false; });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("privacy-is-open");
    if (location.hash === "#privacy") history.replaceState(null, "", location.pathname + location.search);
    opener?.focus({ preventScroll: true });
  });
  const openFromHash = () => { if (location.hash === "#privacy") open(); };
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
