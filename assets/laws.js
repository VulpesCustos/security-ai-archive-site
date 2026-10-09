(() => {
  "use strict";
  const API_BASE = "https://laws-api.prifoxy.com";
  const $ = (name) => document.querySelector(`[data-law-${name}]`);
  const all = (name) => Array.from(document.querySelectorAll(`[data-law-${name}]`));
  const form = $("form"), input = $("search"), apiStatus = $("api-status");
  if (!form || !input || !apiStatus) return;
  const state = { scope: "name", category: "all", view: "recent", panel: "updates", detailReturnPanel: "updates", query: "", searchScope: "name", detail: null, detailTrigger: null, changesOnly: false, changeSummary: null, toc: [], tocEntries: [], tocCurrent: null };
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
  const showPanel = (panel) => {
    state.panel = panel;
    $("updates").hidden = panel !== "updates";
    $("live-results").hidden = panel !== "search";
    $("viewer").hidden = panel !== "detail";
    apiStatus.hidden = panel === "detail";
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
    ? "자주 확인하는 법령" : "전체 법령 · 시행일 가까운 순";
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
    const retry = $(isSearch ? "search-retry" : "update-retry");
    const more = $(isSearch ? "load-more" : "update-more");
    const section = $(isSearch ? "live-results" : "updates");
    const page = append ? lists[channel].page + 1 : 1;
    const job = begin(channel);
    retry.hidden = true;
    section.setAttribute("aria-busy", "true");
    if (!append) {
      lists[channel] = { page: 0, loaded: 0, total: null, more: false };
      list.replaceChildren();
      if (isSearch) {
        $("search-time").textContent = "";
        $("live-summary").textContent = "";
      }
    }
    status.textContent = append ? "다음 법령을 불러오는 중입니다…" : !isSearch && state.view === "recent"
      ? "자주 확인하는 법령의 최근 공포 정보를 불러오는 중입니다…" : "공식 법령 정보를 불러오는 중입니다…";
    updatePagination(channel, more);
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
      if (isSearch) {
        $("search-time").textContent = sourceTime(data);
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
      }
    }
  };
  const runSearch = (query = input.value.trim(), scope = state.scope) => {
    if (query.length < 2 || query.length > 100) {
      apiStatus.hidden = false;
      apiStatus.textContent = "검색어는 2자 이상 100자 이하로 입력해 주세요.";
      input.focus();
      return Promise.resolve(null);
    }
    clearViewer();
    showPanel("search");
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
  const articleLabel = (article) => {
    const content = String(article.content || "").trim();
    if (article.isHeading === true) return content.split(/\r?\n/)[0].replace(/\s*<[^>]*>/g, "").trim();
    const parsed = content.match(/^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:\(([^)]+)\))?/);
    const number = /^\d+$/.test(String(article.number || "")) ? String(Number(article.number)) : parsed?.[1];
    const branch = /^\d+$/.test(String(article.branchNumber || "")) ? Number(article.branchNumber) : Number(parsed?.[2] || 0);
    const title = article.title || parsed?.[3] || (parsed && /^\s*삭제/.test(content.slice(parsed[0].length)) ? "삭제" : "");
    return `${number ? `제${number}조${branch ? `의${branch}` : ""}` : "조문"}${title ? ` (${title})` : ""}`;
  };
  const setTocCurrent = (entry) => {
    const id = entry?.target.id || null;
    if (state.tocCurrent === id) return;
    state.tocCurrent = id;
    for (const item of state.tocEntries) item.button.setAttribute("aria-current", String(item === entry));
  };
  const syncTocPosition = () => {
    const container = $("articles");
    const atEnd = container.scrollTop > 0 && container.scrollHeight - container.clientHeight - container.scrollTop <= 2;
    let current = null;
    for (const entry of state.tocEntries) {
      if (entry.target.hidden) continue;
      if (!current || atEnd || entry.target.offsetTop <= container.scrollTop + 28) current = entry;
      else break;
    }
    setTocCurrent(current);
  };
  const jumpToArticle = (entry) => {
    if (entry.target.hidden) {
      $("article-search").value = "";
      state.changesOnly = false;
      $("change-filter").setAttribute("aria-pressed", "false");
      $("change-filter").classList.toggle("is-active", false);
      filterArticles();
    }
    $("articles").scrollTo({ top: Math.max(0, entry.target.offsetTop - 12), behavior: "auto" });
    $("articles").scrollIntoView({ block: "nearest", behavior: "auto" });
    entry.target.focus({ preventScroll: true });
    setTocCurrent(entry);
  };
  const filterToc = () => {
    const query = normalize($("toc-search").value);
    let visible = 0;
    const visit = (entry, ancestorMatches = false) => {
      const matches = ancestorMatches || !query || entry.search.includes(query);
      let childMatches = false;
      for (const child of entry.children) if (visit(child, matches)) childMatches = true;
      entry.item.hidden = !matches && !childMatches;
      if (!entry.item.hidden && !entry.isHeading) visible++;
      return !entry.item.hidden;
    };
    for (const entry of state.toc) visit(entry);
    const hasResults = state.toc.some((entry) => !entry.item.hidden);
    $("toc-status").textContent = hasResults
      ? `${visible}개 조문${query ? " · 목차 검색 결과" : " · 선택하면 바로 이동"}`
      : "일치하는 목차가 없습니다.";
  };
  const renderToc = (articles, targets) => {
    const stack = [];
    articles.forEach((article, index) => {
      const label = articleLabel(article);
      const isHeading = article.isHeading === true;
      const unit = label.match(/^제\s*\d+\s*(편|장|절|관)/)?.[1];
      const rank = { 편: 0, 장: 1, 절: 2, 관: 3 }[unit] ?? 0;
      if (isHeading) while (stack.length && stack[stack.length - 1].rank >= rank) stack.pop();
      const parent = stack[stack.length - 1];
      const item = element("li");
      const button = element("button", `law-toc-link${isHeading ? " law-toc-heading" : ""}`, label);
      button.type = "button";
      button.setAttribute("aria-controls", targets[index].id);
      button.setAttribute("aria-current", "false");
      const entry = { item, button, target: targets[index], search: normalize(label), isHeading, rank, children: [] };
      button.addEventListener("click", () => jumpToArticle(entry));
      item.append(button);
      if (parent) {
        if (!parent.list) {
          parent.list = element("ul", "law-toc-children");
          parent.item.append(parent.list);
        }
        parent.list.append(item);
        parent.children.push(entry);
      } else {
        $("toc-list").append(item);
        state.toc.push(entry);
      }
      state.tocEntries.push(entry);
      if (isHeading) stack.push(entry);
    });
    filterToc();
  };
  const renderArticle = (article, index) => {
    const node = element("article", "law-article");
    node.id = `law-article-${index}`;
    node.tabIndex = -1;
    const changed = article.isHeading !== true && article.change?.status === "changed";
    node.dataset.change = changed ? "changed" : "other";
    node.dataset.heading = String(article.isHeading === true);
    node.classList.toggle("is-changed", changed);
    const heading = element("h3", "", article.content || articleLabel(article));
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
    state.toc = [];
    state.tocEntries = [];
    state.tocCurrent = null;
    $("reading-layout").hidden = true;
    $("toc-list").replaceChildren();
    $("toc-list").scrollTop = 0;
    $("toc-search").value = "";
    $("toc-status").textContent = "";
    $("articles").replaceChildren();
    $("articles").scrollTop = 0;
    $("article-search").value = "";
    $("article-search").disabled = true;
    $("change-filter").disabled = true;
    $("change-filter").textContent = "변경 조항만 보기";
    $("change-filter").setAttribute("aria-pressed", "false");
    $("change-filter").classList.toggle("is-active", false);
    $("change-basis").textContent = "";
    $("change-panel").hidden = true;
    $("article-empty").hidden = true;
    $("article-empty").textContent = "";
    $("viewer-meta").textContent = "";
    $("viewer-status").textContent = "";
    $("viewer-status").hidden = true;
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
    $("change-filter").textContent = known ? `변경 조항만 보기 (${summary.changed})` : "변경 조항만 보기 (정보 미제공)";
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
    $("article-empty").hidden = !filtering || visible > 0;
    if (filtering && visible === 0) {
      const message = state.changesOnly && !query
        ? `공식 변경 표시가 있는 조문이 없습니다.${summary.unknown ? " 변경 정보가 없는 조문의 변경 여부는 확인할 수 없습니다." : ""}`
        : "조건에 맞는 조문이 없습니다. 검색어를 바꾸거나 변경 조항 필터를 해제해 주세요.";
      $("article-empty").textContent = message;
    }
    $("viewer-status").textContent = "";
    $("viewer-status").hidden = true;
    syncTocPosition();
  };
  const clearViewer = () => {
    cancel("detail");
    resetArticleView();
    $("viewer").setAttribute("aria-busy", "false");
    state.detail = null;
    state.detailTrigger = null;
  };
  const prepareViewer = (law, trigger) => {
    if (state.panel !== "detail") state.detailReturnPanel = state.panel;
    cancel("detail");
    resetArticleView();
    state.detail = law;
    state.detailTrigger = trigger || state.detailTrigger;
    showPanel("detail");
    $("viewer").setAttribute("aria-busy", "true");
    $("viewer-title").textContent = law.name || "법령 본문";
    $("viewer-status").textContent = "국가법령정보센터에서 조문을 불러오는 중입니다…";
    $("viewer-status").hidden = false;
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
        $("viewer-status").hidden = false;
        return;
      }
      const fragment = document.createDocumentFragment();
      const targets = data.articles.map(renderArticle);
      for (const target of targets) fragment.append(target);
      $("articles").append(fragment);
      renderToc(data.articles, targets);
      $("reading-layout").hidden = false;
      showChangeInfo(detail, data.articles);
      $("article-search").disabled = false;
      filterArticles();
    } catch (error) {
      if (!isCurrent("detail", job)) return;
      resetArticleView();
      $("viewer-status").textContent = errorText(error);
      $("viewer-status").hidden = false;
      $("detail-retry").hidden = false;
    } finally {
      if (isCurrent("detail", job)) {
        requests.detail.busy = false;
        $("viewer").setAttribute("aria-busy", "false");
      }
    }
  };
  const openCurated = async (law, trigger) => {
    prepareViewer(law, trigger);
    const job = begin("detail");
    try {
      const params = new URLSearchParams({ q: law.name, scope: "name", page: "1" });
      const data = await apiRequest(`/api/laws/search?${params}`, job.controller);
      if (!isCurrent("detail", job)) return;
      if (!Array.isArray(data.items)) throw new Error("INVALID_RESPONSE");
      const exact = data.items.find((item) => normalize(item.name) === normalize(law.name) && (item.mst || item.id));
      if (exact) return openDetail(exact, trigger);
      $("viewer-status").textContent = "해당 법령의 본문을 연결하지 못했습니다. 다시 불러오거나 공식 원문에서 확인해 주세요.";
      $("viewer-status").hidden = false;
      $("detail-retry").hidden = false;
    } catch (error) {
      if (!isCurrent("detail", job)) return;
      $("viewer-status").textContent = errorText(error);
      $("viewer-status").hidden = false;
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
  for (const link of all("open")) link.addEventListener("click", (event) => {
    event.preventDefault();
    const name = link.dataset.lawName || "";
    const law = { name, officialUrl: link.href };
    openCurated(law, link);
  });
  $("update-more").addEventListener("click", () => loadList("updates", { append: true }));
  $("load-more").addEventListener("click", () => loadList("search", { append: true }));
  $("detail-retry").addEventListener("click", () => {
    if (!state.detail) return;
    if (state.detail.mst || state.detail.id) openDetail(state.detail);
    else openCurated(state.detail);
  });
  $("search-close").addEventListener("click", () => {
    cancel("search");
    $("live-results").setAttribute("aria-busy", "false");
    clearViewer();
    input.value = "";
    state.query = "";
    apiStatus.textContent = "검색어를 2자 이상 입력해 주세요.";
    updateCurated();
    showPanel("updates");
    input.focus();
  });
  $("article-search").addEventListener("input", filterArticles);
  $("toc-search").addEventListener("input", filterToc);
  $("articles").addEventListener("scroll", syncTocPosition);
  $("change-filter").addEventListener("click", () => {
    if ($("change-filter").disabled || !state.changeSummary) return;
    state.changesOnly = !state.changesOnly;
    $("change-filter").setAttribute("aria-pressed", String(state.changesOnly));
    $("change-filter").classList.toggle("is-active", state.changesOnly);
    filterArticles();
  });
  $("viewer-close").addEventListener("click", () => {
    const trigger = state.detailTrigger;
    clearViewer();
    showPanel(state.detailReturnPanel);
    if (!trigger || trigger.isConnected === false || trigger.closest?.("[hidden]")) input.focus();
    else trigger.focus();
  });
  showPanel("updates");
  updateCurated();
  updateScopeNote();
  loadList("updates");
})();
