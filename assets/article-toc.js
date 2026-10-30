(() => {
  "use strict";
  const toc = document.querySelector("[data-article-toc]");
  const track = toc?.closest(".article-toc-track");
  if (!toc || !track) return;
  const entries = [...toc.querySelectorAll('a[href^="#"]')].map((link) => ({
    link,
    heading: document.getElementById(decodeURIComponent(link.hash.slice(1)))
  })).filter((entry) => entry.heading);
  if (!entries.length) return;

  const compact = window.matchMedia("(max-width: 760px)");
  let current = null;
  let frame = 0;
  const highlight = () => {
    let next = null;
    for (const entry of entries) {
      if (entry.heading.getBoundingClientRect().top <= 96) next = entry;
      else break;
    }
    if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      next = entries[entries.length - 1];
    }
    if (next === current) return;
    current?.link.removeAttribute("aria-current");
    next?.link.setAttribute("aria-current", "location");
    current = next;
  };

  const schedule = () => {
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(update);
  };
  function update() {
    frame = 0;
    // CSS handles the fixed reading position; only the active section changes.
    if (!document.documentElement.classList.contains("article-image-is-open")) highlight();
  }
  const setDisclosure = () => {
    toc.open = !compact.matches;
    schedule();
  };
  compact.addEventListener("change", setDisclosure);

  // Native fragments retain keyboard navigation, shareable links and browser history.
  toc.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (compact.matches && event.target.closest('a[href^="#"]')) toc.open = false;
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("load", schedule, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(track);
    observer.observe(toc);
  }
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  setDisclosure();
})();
