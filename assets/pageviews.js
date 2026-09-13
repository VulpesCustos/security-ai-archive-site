(() => {
  "use strict";
  if (location.origin !== "https://prifoxy.com") return;
  const panel = document.querySelector("[data-pageviews]");
  const endpoint = "https://laws-api.prifoxy.com/api/pageviews";
  const storageKey = "prifoxy-daily-visit";
  const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let loading;
  let pending = false;
  let latestTotal = -1;

  const validCounts = (counts) => counts && counts.metric === "daily-browser" &&
    /^\d{4}-\d{2}-\d{2}$/.test(counts.date) && Number.isSafeInteger(counts.total) &&
    Number.isSafeInteger(counts.today) && counts.today >= 0 && counts.total >= counts.today;
  const show = (counts) => {
    if (!panel || !validCounts(counts) || counts.total < latestTotal) return;
    latestTotal = counts.total;
    panel.querySelector("[data-pageviews-total]").textContent = counts.total.toLocaleString("ko-KR");
    panel.querySelector("[data-pageviews-today]").textContent = counts.today.toLocaleString("ko-KR");
  };
  const request = async (visit) => {
    const response = await fetch(endpoint, {
      method: visit ? "POST" : "GET",
      ...(visit ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(visit) } : {}),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok && response.status !== 409) return;
    const counts = await response.json();
    if (!validCounts(counts)) return;
    show(counts);
    return { counts, status: response.status };
  };
  const loadTurnstile = () => {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => reject(new Error("script timeout")), 10000);
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error("script unavailable")); };
      document.head.append(script);
    });
    return loading;
  };
  const verify = async () => {
    let container;
    let widget;
    try {
      await loadTurnstile();
      container = document.createElement("div");
      document.body.append(container);
      const token = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("verification timeout")), 20000);
        const finish = (value) => { clearTimeout(timeout); value ? resolve(value) : reject(new Error("verification failed")); };
        widget = window.turnstile.render(container, {
          sitekey: "0x4AAAAAAEpRn80EaHueDLuv",
          action: "pageview", execution: "execute", retry: "never",
          "refresh-expired": "never", "refresh-timeout": "never",
          callback: finish,
          "error-callback": () => { finish(); return true; },
          "expired-callback": () => finish(),
          "timeout-callback": () => finish()
        });
        window.turnstile.execute(widget);
      });
      return token;
    } finally {
      if (widget !== undefined) window.turnstile.remove(widget);
      if (container) container.remove();
    }
  };
  const visitForDate = (date) => {
    let visit;
    try { visit = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Check writes below. */ }
    if (visit?.date === date && visitorPattern.test(visit.visitorId)) return visit;
    visit = { date, visitorId: crypto.randomUUID(), counted: false };
    localStorage.setItem(storageKey, JSON.stringify(visit));
    // Do not count when storage is blocked or silently discards the identifier.
    if (localStorage.getItem(storageKey) !== JSON.stringify(visit)) throw new Error("storage unavailable");
    return visit;
  };
  const update = async () => {
    if (pending || document.visibilityState !== "visible") return;
    pending = true;
    try {
      // Use the server's Korean date, not the visitor's device clock.
      const current = await request();
      if (!current || !current.counts.ok || !navigator.locks) return;
      let date = current.counts.date;
      // Serialize first visits across tabs so they share one daily identifier.
      await navigator.locks.request(storageKey, { signal: AbortSignal.timeout(35000) }, async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const visit = visitForDate(date);
          if (visit.counted === true) {
            // Another tab may have completed the first visit while this one waited.
            if (panel) await request();
            return;
          }
          const token = await verify();
          const result = await request({ token, visitorId: visit.visitorId, date });
          if (!result) return;
          if (result.status === 409) {
            // Midnight passed during verification: the rejected write did not count.
            date = result.counts.date;
            continue;
          }
          if (result.counts.ok && result.counts.accepted && result.counts.date === date) {
            localStorage.setItem(storageKey, JSON.stringify({ ...visit, counted: true }));
          }
          return;
        }
      });
    } catch {
      // Keep the same ID after a failed response; the server deduplicates retries.
      // Without safe shared storage or verification, leave counts readable only.
    } finally {
      pending = false;
    }
  };
  window.addEventListener("pageshow", (event) => { if (event.persisted) update(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") update(); });
  if (document.visibilityState === "visible") update();
})();
