(() => {
  "use strict";
  if (location.origin !== "https://prifoxy.com") return;
  const panel = document.querySelector("[data-pageviews]");
  const endpoint = "https://laws-api.prifoxy.com/api/pageviews";
  let loading;
  let pending = false;
  let latestTotal = -1;

  const show = (counts) => {
    if (!panel || !counts.ok || !Number.isSafeInteger(counts.total) ||
        !Number.isSafeInteger(counts.today) || counts.today < 0 || counts.total < counts.today || counts.total < latestTotal) return;
    latestTotal = counts.total;
    panel.querySelector("[data-pageviews-total]").textContent = counts.total.toLocaleString("ko-KR");
    panel.querySelector("[data-pageviews-today]").textContent = counts.today.toLocaleString("ko-KR");
  };
  const request = async (token) => {
    const response = await fetch(endpoint, {
      method: token ? "POST" : "GET",
      ...(token ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) } : {}),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return;
    show(await response.json());
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
  const update = async () => {
    if (pending) return;
    pending = true;
    // Existing counts remain readable if verification is blocked or unavailable.
    if (panel) request().catch(() => {});
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
      await request(token);
    } catch {
      // Never block reading or fall back to an unverified increment.
    } finally {
      if (widget !== undefined) window.turnstile.remove(widget);
      if (container) container.remove();
      pending = false;
    }
  };
  window.addEventListener("pageshow", (event) => { if (event.persisted) update(); });
  if (document.visibilityState === "visible") update();
  else {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      update();
    };
    document.addEventListener("visibilitychange", onVisible);
  }
})();
