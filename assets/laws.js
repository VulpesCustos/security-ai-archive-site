(() => {
  "use strict";
  const API_BASE = "https://laws-api.prifoxy.com";
  const $ = (name) => document.querySelector(`[data-law-${name}]`);
  const all = (name) => Array.from(document.querySelectorAll(`[data-law-${name}]`));
  const form = $("form"), input = $("search"), apiStatus = $("api-status");
  if (!form || !input || !apiStatus) return;
  const state = { scope: "name", category: "all", view: "recent", query: "", searchScope: "name", detail: null, detailTrigger: null, changesOnly: false, changeSummary: null };
  const requests = { search: { sequence: 0 }, updates: { sequence: 0 }, detail: { sequence: 0 } };
  const lists = { search: { page: 0, loaded: 0, total: null, more: false }, updates: { page: 0, loaded: 0, total: null, more: false } };
  const normalize = (value) => String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const dateDigits = (value) => String(value || "").replace(/-/g, "");
  const formatDate = (value, compact = false) => {
    const date = dateDigits(value);
    if (!/^\d{8}$/.test(date)) return "미제공";
    return compact ? `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}` : `${Number(date.slice(0, 4))}년 ${Number(date.slice(4, 6))}월 ${Number(date.slice(6, 8))}일`;
  };
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()).replace(/-/g, "");
  const safeOfficialUrl = (value) => {
    try {
      const url = new URL(value);
      if (url.origin === "https://www.law.go.kr" && !url.username && !url.password) return url.href;
    } catch { /* External API strings must not become unsafe links. */ }
    return "https://www.law.go.kr";
  };
  const sourceTime = (data) => {
    const date = new Date(data.fetchedAt);
    const time = Number.isNaN(date.getTime()) ? "확인 시각 미제공" : `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)} 확인 (한국시간)`;
    return `국가법령정보센터 · ${time}`;
  };
  const setButtons = (name, active, field) => {
    for (const button of all(name)) {
      const selected = button.dataset[field] === active;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  };
  const cancel = (channel) => {
    const request = requests[channel];
    request.controller?.abort();
    request.sequence += 1;
    request.busy = false;
  };
  const begin = (channel) => {
    cancel(channel);
    const request = requests[channel];
    request.controller = new AbortController();
    request.busy = true;
    return { sequence: request.sequence, controller: request.controller };
  };
  const isCurrent = (channel, job) => requests[channel].sequence === job.sequence;
  const apiRequest = async (path, controller) => {
    const timeout = window.setTimeout(() => controller.abort(), 50_000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { method: "GET", credentials: "omit", headers: { Accept: "application/json" }, signal: controller.signal });
      const data = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : null;
      if (!response.ok || !data?.ok) throw new Error(response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE");
      return data;
    } finally { window.clearTimeout(timeout); }
  };
  const errorText = (error) => error.message === "RATE_LIMIT"
    ? "요청이 많아 잠시 쉬고 있습니다. 1분 후 다시 시도해 주세요."
    : "공식 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하거나 국가법령정보센터에서 확인해 주세요.";
  const updateScopeText = () => state.view === "recent"
    ? "자주 확인하는 법령 · 공포일 최신순" : "전체 법령 · 시행일 가까운 순";
  const updateScopeNote = () => {
    $("update-note").textContent = state.view === "recent"
      ? "최근 공포는 아래 ‘자주 확인하는 법령’에 등록된 법령만 표시합니다. 고시는 이 목록에 포함되지 않으며 하단의 공식 원문에서 확인할 수 있습니다. 공포일과 시행일은 다를 수 있으니 시행일도 함께 확인하세요."
      : "시행 예정은 전체 법령 중 앞으로 90일 내 시행되는 법령을 표시합니다. 적용할 법령의 시행일과 공식 원문을 함께 확인하세요.";
  };
  const renderLaw = (law, view = "search") => {
    const card = element("article", "law-live-card");
    const button = element("button", "law-live-open");
    button.type = "button";
    const effective = dateDigits(law.effectiveDate);
    const isUpcoming = /^\d{8}$/.test(effective) && effective > today();
    button.setAttribute("aria-label", [law.name, law.kind || "법령", `공포 ${formatDate(law.promulgationDate)}`, `시행 ${formatDate(law.effectiveDate)}`, isUpcoming ? "시행 예정" : "", "조문 보기"].filter(Boolean).join(" · "));
    button.addEventListener("click", () => openDetail(law, button));
    const type = element("div", "law-live-type");
    type.append(element("span", "", law.kind || "법령"), element("small", "", law.amendmentType || ""));
    const body = element("div", "law-live-body");
    body.append(element("h3", "", law.name), element("p", "", law.department || "소관부처 미제공"));
    if (isUpcoming) body.append(element("span", "law-effective-badge", "시행 예정"));
    const dates = element("div", "law-live-dates");
    for (const [label, value, primary] of [["공포", law.promulgationDate, view === "recent"], ["시행", law.effectiveDate, view !== "recent"]]) {
      const row = element("span", primary ? "is-primary" : "");
      const time = element("time", "", formatDate(value, true));
      const digits = dateDigits(value);
      if (/^\d{8}$/.test(digits)) time.dateTime = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      row.append(element("span", "", label), time);
      dates.append(row);
    }
    button.append(type, body, dates);
    card.append(button);
    return card;
  };
  const updatePagination = (channel, button) => {
    button.hidden = !lists[channel].more;
    button.disabled = Boolean(requests[channel].busy);
    button.textContent = requests[channel].busy ? "불러오는 중…" : "법령 더 보기";
  };
  const loadList = async (channel, { append = false } = {}) => {
    if (append && (requests[channel].busy || !lists[channel].more)) return null;
    const isSearch = channel === "search";
    const list = $(isSearch ? "live-list" : "update-list");
    const status = isSearch ? apiStatus : $("update-status");
    const time = $(isSearch ? "search-time" : "update-time");
    const retry = $(isSearch ? "search-retry" : "update-retry");
    const more = $(isSearch ? "load-more" : "update-more");
    const section = $(isSearch ? "live-results" : "updates");
    const page = append ? lists[channel].page + 1 : 1;
    const job = begin(channel);
    retry.hidden = true;
    section.hidden = false;
    section.setAttribute("aria-busy", "true");
    if (!append) {
      lists[channel] = { page: 0, loaded: 0, total: null, more: false };
      list.replaceChildren();
      time.textContent = "";
      if (isSearch) $("live-summary").textContent = "";
    }
    status.textContent = append ? "다음 법령을 불러오는 중입니다…" : !isSearch && state.view === "recent"
      ? "자주 확인하는 법령의 최근 공포 정보를 불러오는 중입니다…" : "공식 법령 정보를 불러오는 중입니다…";
    updatePagination(channel, more);
    if (!isSearch) $("refresh").disabled = true;
    try {
      const params = new URLSearchParams(isSearch ? { q: state.query, scope: state.searchScope, page: String(page) } : { view: state.view, page: String(page) });
      // A distinct URL avoids reusing a browser-cached, formerly nationwide list.
      if (!isSearch && state.view === "recent") params.set("scope", "curated");
      const data = await apiRequest(`/api/laws/${isSearch ? "search" : "updates"}?${params}`, job.controller);
      if (!isCurrent(channel, job)) return null;
      if (!Array.isArray(data.items) || !Number.isFinite(Number(data.total))) throw new Error("INVALID_RESPONSE");
      const fragment = document.createDocumentFragment();
      for (const law of data.items) fragment.append(renderLaw(law, isSearch ? "search" : state.view));
      list.append(fragment);
      const current = lists[channel];
      current.page = page;
      current.loaded += data.items.length;
      current.total = Math.max(0, Number(data.total));
      const maxPage = Math.min(100, Math.max(1, Math.floor(Number(data.maxPage) || 100)));
      current.more = data.items.length > 0 && current.loaded < current.total && page < maxPage;
      const limitNotice = page >= maxPage && current.loaded < current.total
        ? ` · 한 번에 최대 ${maxPage.toLocaleString("ko-KR")}페이지까지 조회합니다. 조회 범위를 좁혀 검색해 주세요.` : "";
      const summary = `${current.total.toLocaleString("ko-KR")}건 중 ${current.loaded.toLocaleString("ko-KR")}건 표시${limitNotice}`;
      time.textContent = sourceTime(data);
      if (isSearch) {
        $("live-summary").textContent = summary;
        status.textContent = `“${state.query}” ${state.searchScope === "body" ? "본문" : "법령명"} 검색 결과입니다.${limitNotice}`;
      } else {
        status.textContent = summary;
        const windowText = data.window?.from && data.window?.to ? `${formatDate(data.window.from, true)}–${formatDate(data.window.to, true)} · ` : "";
        $("update-window").textContent = `${windowText}${updateScopeText()}`;
      }
      if (!current.loaded) list.append(element("p", "law-live-empty", isSearch
        ? "일치하는 법령이 없습니다. 검색어 또는 검색 범위를 바꿔 보세요."
        : state.view === "recent"
          ? "최근 90일 내 공포된 대상 법령이 없습니다. 현재 법령은 아래 ‘자주 확인하는 법령’에서 확인할 수 있습니다."
          : "조회 기간에 시행 예정인 법령이 없습니다."));
      return data;
    } catch (error) {
      if (!isCurrent(channel, job)) return null;
      status.textContent = `${append ? "다음 목록을 불러오지 못했습니다. 기존 목록은 유지됩니다. " : ""}${errorText(error)}`;
      if (!append) list.append(element("p", "law-live-empty", "현재 목록을 확인할 수 없습니다. 조회 실패는 법령이 없다는 의미가 아닙니다."));
      retry.hidden = false;
      retry.onclick = () => loadList(channel, { append });
      return null;
    } finally {
      if (isCurrent(channel, job)) {
        requests[channel].busy = false;
        section.setAttribute("aria-busy", "false");
        updatePagination(channel, more);
        if (!isSearch) $("refresh").disabled = false;
      }
    }
  };
  const runSearch = (query = input.value.trim(), scope = state.scope) => {
    if (query.length < 2 || query.length > 100) {
      apiStatus.textContent = "검색어는 2자 이상 100자 이하로 입력해 주세요.";
      input.focus();
      return Promise.resolve(null);
    }
    state.query = query;
    state.searchScope = scope;
    return loadList("search");
  };
  const nestedItems = (items) => {
    const list = element("ol", "law-subitems");
    for (const item of items || []) {
      const li = element("li");
      li.append(element("p", "", item.content || item.number || ""));
      if (item.children?.length) li.append(nestedItems(item.children));
      list.append(li);
    }
    return list;
  };
  const renderArticle = (article) => {
    const node = element("article", "law-article");
    const changed = article.isHeading !== true && article.change?.status === "changed";
    node.dataset.change = changed ? "changed" : "other";
    node.dataset.heading = String(article.isHeading === true);
    node.classList.toggle("is-changed", changed);
    const heading = element("h3", "", article.content || `제${article.number}조${article.title ? ` (${article.title})` : ""}`);
    node.append(heading);
    if (article.reference) node.append(element("small", "law-article-reference", article.reference));
    for (const paragraph of article.paragraphs || []) {
      const group = element("div", "law-paragraph");
      group.append(element("p", "", paragraph.content || paragraph.number || ""));
      if (paragraph.items?.length) group.append(nestedItems(paragraph.items));
      node.append(group);
    }
    node.dataset.search = normalize(node.textContent);
    if (changed) {
      const labels = { new: "신설", amended: "개정", deleted: "삭제", moved: "이동", changed: "변경" };
      const label = Object.hasOwn(labels, article.change.type) ? labels[article.change.type] : "변경";
      heading.append(element("span", "law-change-badge", label));
    }
    return node;
  };
  const resetArticleView = () => {
    state.changesOnly = false;
    state.changeSummary = null;
    $("articles").replaceChildren();
    $("article-search").value = "";
    $("article-search").disabled = true;
    $("change-filter").disabled = true;
    $("change-filter").textContent = "변경 조항만 보기";
    $("change-filter").setAttribute("aria-pressed", "false");
    $("change-filter").classList.toggle("is-active", false);
    $("change-summary").textContent = "";
    $("change-basis").textContent = "";
    $("change-panel").hidden = true;
    $("article-empty").hidden = true;
    $("article-empty").textContent = "";
    $("viewer-meta").textContent = "";
    $("viewer-status").textContent = "";
    $("detail-retry").hidden = true;
  };
  const showChangeInfo = (law, articles) => {
    const summary = { total: 0, changed: 0, unchanged: 0, unknown: 0 };
    for (const article of articles) {
      if (article.isHeading === true) continue;
      summary.total++;
      const status = article.change?.status;
      summary[status === "changed" || status === "unchanged" ? status : "unknown"]++;
    }
    state.changeSummary = summary;
    const known = summary.changed + summary.unchanged;
    $("change-filter").disabled = known === 0;
    $("change-filter").textContent = known ? `변경 조항만 보기 (${summary.changed})` : "변경 조항만 보기";
    $("change-summary").textContent = known
      ? `공식 변경 표시 ${summary.changed}개${summary.unknown ? ` · 변경 정보 미제공 ${summary.unknown}개` : ""}`
      : "변경 정보 미제공 · 변경 여부를 확인할 수 없습니다.";
    $("change-basis").textContent = `강조 기준: 공포 ${formatDate(law.promulgationDate)} · 시행 ${formatDate(law.effectiveDate)}`;
    $("change-panel").hidden = false;
  };
  const filterArticles = () => {
    if ($("article-search").disabled) return;
    const query = normalize($("article-search").value);
    const articles = Array.from($("articles").querySelectorAll(".law-article"));
    let visible = 0;
    for (const article of articles) {
      article.hidden = Boolean((query && (article.dataset.heading === "true" || !article.dataset.search.includes(query))) || (state.changesOnly && article.dataset.change !== "changed"));
      if (!article.hidden && article.dataset.heading !== "true") visible++;
    }
    const summary = state.changeSummary;
    const filtering = Boolean(query || state.changesOnly);
    let status = filtering
      ? `${summary.total}개 조문 중 ${visible}개 표시${state.changesOnly ? " · 공식 변경 표시 조문만" : ""}${query ? " · 본문 검색 적용" : ""}`
      : `${summary.total}개 조문 · 부칙·별표·서식은 공식 원문에서 확인하세요.`;
    if (summary.unknown) status += ` · ${summary.unknown}개 조문은 변경 정보 미제공`;
    $("article-empty").hidden = !filtering || visible > 0;
    if (filtering && visible === 0) {
      const message = state.changesOnly && !query
        ? `공식 변경 표시가 있는 조문이 없습니다.${summary.unknown ? " 변경 정보가 없는 조문의 변경 여부는 확인할 수 없습니다." : ""}`
        : "조건에 맞는 조문이 없습니다. 검색어를 바꾸거나 변경 조항 필터를 해제해 주세요.";
      $("article-empty").textContent = message;
      status += ` · ${message}`;
    }
    $("viewer-status").textContent = status;
  };
  const prepareViewer = (law, trigger) => {
    cancel("detail");
    resetArticleView();
    state.detail = law;
    state.detailTrigger = trigger || state.detailTrigger;
    $("viewer").hidden = false;
    $("viewer").setAttribute("aria-busy", "true");
    $("viewer-title").textContent = law.name || "법령 본문";
    $("viewer-status").textContent = "국가법령정보센터에서 조문을 불러오는 중입니다…";
    $("viewer-link").href = safeOfficialUrl(law.officialUrl);
    $("viewer-title").focus({ preventScroll: true });
    $("viewer").scrollIntoView({ behavior: "auto", block: "start" });
  };
  const openDetail = async (law, trigger) => {
    prepareViewer(law, trigger);
    const job = begin("detail");
    try {
      const params = new URLSearchParams(law.mst ? { mst: String(law.mst) } : { id: String(law.id) });
      params.set("annotations", "changes1");
      if (law.target === "eflaw") {
        params.set("target", "eflaw");
        params.set("effectiveDate", dateDigits(law.effectiveDate));
      }
      const data = await apiRequest(`/api/laws/detail?${params}`, job.controller);
      if (!isCurrent("detail", job)) return;
      const detail = data.law || {};
      $("viewer-title").textContent = detail.name || law.name || "법령 본문";
      $("viewer-meta").textContent = [detail.kind, detail.department, detail.amendmentType, `공포 ${formatDate(detail.promulgationDate)}`, `시행 ${formatDate(detail.effectiveDate)}`].filter(Boolean).join(" · ");
      $("viewer-link").href = safeOfficialUrl(detail.officialUrl || law.officialUrl);
      if (!Array.isArray(data.articles) || !data.articles.length) {
        $("viewer-status").textContent = "표시할 조문이 제공되지 않았습니다. 부칙·별표를 포함한 전체 내용은 공식 원문에서 확인해 주세요.";
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const article of data.articles) fragment.append(renderArticle(article));
      $("articles").append(fragment);
      showChangeInfo(detail, data.articles);
      $("article-search").disabled = false;
      filterArticles();
    } catch (error) {
      if (!isCurrent("detail", job)) return;
      resetArticleView();
      $("viewer-status").textContent = errorText(error);
      $("detail-retry").hidden = false;
    } finally {
      if (isCurrent("detail", job)) {
        requests.detail.busy = false;
        $("viewer").setAttribute("aria-busy", "false");
      }
    }
  };
  const updateCurated = () => {
    const query = normalize(input.value);
    let count = 0;
    for (const card of all("card")) {
      card.hidden = !((state.category === "all" || card.dataset.category === state.category) && (!query || normalize(card.dataset.search).includes(query)));
      if (!card.hidden) count++;
    }
    $("count").textContent = String(count);
    $("empty").hidden = count > 0;
    const url = new URL("https://www.law.go.kr/lsSc.do");
    url.searchParams.set("menuId", "1");
    url.searchParams.set("subMenuId", "15");
    if (input.value.trim()) url.searchParams.set("query", input.value.trim());
    $("official-search").href = url.href;
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); runSearch(); });
  input.addEventListener("input", updateCurated);
  for (const button of all("scope")) button.addEventListener("click", () => { state.scope = button.dataset.lawScope; setButtons("scope", state.scope, "lawScope"); });
  for (const button of all("filter")) button.addEventListener("click", () => { state.category = button.dataset.lawFilter; setButtons("filter", state.category, "lawFilter"); updateCurated(); });
  for (const button of all("view")) button.addEventListener("click", () => {
    state.view = button.dataset.lawView;
    setButtons("view", state.view, "lawView");
    $("update-window").textContent = updateScopeText();
    updateScopeNote();
    loadList("updates");
  });
  for (const link of all("open")) link.addEventListener("click", async (event) => {
    event.preventDefault();
    const name = link.dataset.lawName || "";
    const law = { name, officialUrl: link.href };
    prepareViewer(law, link);
    const detailSequence = requests.detail.sequence;
    input.value = name;
    state.scope = "name";
    setButtons("scope", "name", "lawScope");
    updateCurated();
    const data = await runSearch(name, "name");
    if (requests.detail.sequence !== detailSequence) return;
    const exact = (data?.items || []).find((item) => normalize(item.name) === normalize(name));
    if (exact) openDetail(exact, link);
    else {
      $("viewer").setAttribute("aria-busy", "false");
      $("viewer-status").textContent = "해당 법령의 본문을 연결하지 못했습니다. 공식 원문에서 확인하거나 검색 결과에서 법령을 선택해 주세요.";
    }
  });
  $("refresh").addEventListener("click", () => loadList("updates"));
  $("update-more").addEventListener("click", () => loadList("updates", { append: true }));
  $("load-more").addEventListener("click", () => loadList("search", { append: true }));
  $("detail-retry").addEventListener("click", () => { if (state.detail) openDetail(state.detail); });
  $("article-search").addEventListener("input", filterArticles);
  $("change-filter").addEventListener("click", () => {
    if ($("change-filter").disabled || !state.changeSummary) return;
    state.changesOnly = !state.changesOnly;
    $("change-filter").setAttribute("aria-pressed", String(state.changesOnly));
    $("change-filter").classList.toggle("is-active", state.changesOnly);
    filterArticles();
  });
  $("viewer-close").addEventListener("click", () => {
    cancel("detail");
    resetArticleView();
    $("viewer").hidden = true;
    $("viewer").setAttribute("aria-busy", "false");
    state.detailTrigger?.focus();
    state.detail = null;
    state.detailTrigger = null;
  });
  updateCurated();
  updateScopeNote();
  loadList("updates");
})();
