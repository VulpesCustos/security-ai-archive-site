(() => {
  "use strict";

  const API_BASE = "https://laws-api.prifoxy.com";

  const searchForm = document.querySelector("[data-law-form]");
  const searchInput = document.querySelector("[data-law-search]");
  const submitButton = document.querySelector("[data-law-submit]");
  const scopeButtons = Array.from(document.querySelectorAll("[data-law-scope]"));
  const filterButtons = Array.from(document.querySelectorAll("[data-law-filter]"));
  const lawCards = Array.from(document.querySelectorAll("[data-law-card]"));
  const curatedLinks = Array.from(document.querySelectorAll("[data-law-open]"));
  const resultCount = document.querySelector("[data-law-count]");
  const emptyState = document.querySelector("[data-law-empty]");
  const apiStatus = document.querySelector("[data-law-api-status]");
  const officialSearchLink = document.querySelector("[data-law-official-search]");
  const liveSection = document.querySelector("[data-law-live-results]");
  const liveSummary = document.querySelector("[data-law-live-summary]");
  const liveList = document.querySelector("[data-law-live-list]");
  const loadMoreButton = document.querySelector("[data-law-load-more]");
  const viewer = document.querySelector("[data-law-viewer]");
  const viewerTitle = document.querySelector("[data-law-viewer-title]");
  const viewerMeta = document.querySelector("[data-law-viewer-meta]");
  const viewerLink = document.querySelector("[data-law-viewer-link]");
  const viewerClose = document.querySelector("[data-law-viewer-close]");
  const viewerStatus = document.querySelector("[data-law-viewer-status]");
  const articleSearch = document.querySelector("[data-law-article-search]");
  const articleList = document.querySelector("[data-law-articles]");

  if (!searchForm || !searchInput || !resultCount || !emptyState || !apiStatus) {
    return;
  }

  const state = {
    activeCategory: "all",
    scope: "name",
    query: "",
    page: 1,
    total: 0,
    loaded: 0,
    searching: false
  };

  const normalize = (value) => String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

  const createElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = String(text);
    }
    return element;
  };

  const formatDate = (value) => {
    const date = String(value || "");
    if (!/^\d{8}$/.test(date)) {
      return "";
    }

    return `${Number(date.slice(0, 4))}년 ${Number(date.slice(4, 6))}월 ${Number(date.slice(6, 8))}일`;
  };

  const setOfficialSearchLink = (query) => {
    if (!officialSearchLink) {
      return;
    }

    const url = new URL("https://www.law.go.kr/lsSc.do");
    url.searchParams.set("menuId", "1");
    url.searchParams.set("subMenuId", "15");
    if (query) {
      url.searchParams.set("query", query);
    }
    officialSearchLink.href = url.toString();
  };

  const setSafeOfficialLink = (value) => {
    if (!viewerLink) {
      return;
    }

    try {
      const url = new URL(value);
      viewerLink.href = url.origin === "https://www.law.go.kr" ? url.toString() : "https://www.law.go.kr";
    } catch {
      viewerLink.href = "https://www.law.go.kr";
    }
  };

  const updateCuratedResults = () => {
    const query = normalize(searchInput.value);
    let visibleCount = 0;

    for (const card of lawCards) {
      const matchesCategory = state.activeCategory === "all" || card.dataset.category === state.activeCategory;
      const matchesQuery = !query || normalize(card.dataset.search).includes(query);
      const isVisible = matchesCategory && matchesQuery;

      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount += 1;
      }
    }

    resultCount.textContent = String(visibleCount);
    emptyState.hidden = visibleCount !== 0;
    setOfficialSearchLink(searchInput.value.trim());
  };

  const apiRequest = async (path) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "API_NOT_AVAILABLE");
      }

      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const renderSearchItem = (law) => {
    const article = createElement("article", "law-live-card");
    const button = createElement("button", "law-live-open");
    button.type = "button";
    button.addEventListener("click", () => openDetail(law.id, law.officialUrl));

    const type = createElement("div", "law-live-type");
    type.append(createElement("span", "", law.kind || "현행 법령"));
    type.append(createElement("small", "", law.amendmentType || ""));

    const body = createElement("div", "law-live-body");
    body.append(createElement("h3", "", law.name));
    const meta = [law.department, formatDate(law.effectiveDate) && `시행 ${formatDate(law.effectiveDate)}`]
      .filter(Boolean)
      .join(" · ");
    body.append(createElement("p", "", meta));

    button.append(type, body, createElement("strong", "", "본문 보기"));
    article.append(button);
    return article;
  };

  const renderSearchResults = (items, append) => {
    if (!liveList || !liveSection) {
      return;
    }

    if (!append) {
      liveList.replaceChildren();
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      fragment.append(renderSearchItem(item));
    }
    liveList.append(fragment);
    liveSection.hidden = false;
  };

  const updateSearchSummary = () => {
    if (liveSummary) {
      liveSummary.textContent = `전체 ${state.total.toLocaleString("ko-KR")}건 중 ${state.loaded.toLocaleString("ko-KR")}건 표시`;
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = state.loaded >= state.total || state.searching;
    }
  };

  const runSearch = async ({ append = false, query = searchInput.value.trim(), scope = state.scope } = {}) => {
    if (state.searching) {
      return null;
    }

    if (query.length < 2 || query.length > 100) {
      apiStatus.textContent = "검색어는 2자 이상 100자 이하로 입력해 주세요.";
      searchInput.focus();
      return null;
    }

    state.searching = true;
    state.query = query;
    state.scope = scope;
    state.page = append ? state.page + 1 : 1;
    apiStatus.textContent = append ? "다음 검색 결과를 불러오는 중입니다…" : "국가법령정보센터에서 현행 법령을 검색하는 중입니다…";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "검색 중…";
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = true;
    }

    try {
      const params = new URLSearchParams({ q: query, scope, page: String(state.page) });
      const data = await apiRequest(`/api/laws/search?${params.toString()}`);
      renderSearchResults(data.items || [], append);
      state.total = Number(data.total) || 0;
      state.loaded = append ? state.loaded + (data.items || []).length : (data.items || []).length;
      apiStatus.textContent = `${data.source}의 현행 법령 ${state.total.toLocaleString("ko-KR")}건을 찾았습니다.`;
      updateSearchSummary();

      if (!append && state.total === 0 && liveList) {
        liveList.append(createElement("p", "law-live-empty", "일치하는 현행 법령이 없습니다. 검색 범위나 검색어를 바꿔 보세요."));
      }
      return data;
    } catch {
      state.page = append ? Math.max(1, state.page - 1) : 1;
      apiStatus.textContent = "실시간 API가 아직 연결되지 않았거나 일시적으로 응답하지 않습니다. 아래 주요 법령 또는 공식 사이트 검색을 이용해 주세요.";
      if (!append && liveSection) {
        liveSection.hidden = true;
      }
      return null;
    } finally {
      state.searching = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "통합 검색";
      }
      updateSearchSummary();
    }
  };

  const renderNestedItems = (items) => {
    const list = createElement("ol", "law-subitems");
    for (const item of items || []) {
      const listItem = createElement("li");
      const text = [item.number, item.content].filter(Boolean).join(" ");
      listItem.append(createElement("p", "", text));
      if (item.children?.length) {
        listItem.append(renderNestedItems(item.children));
      }
      list.append(listItem);
    }
    return list;
  };

  const renderArticle = (article) => {
    const wrapper = createElement("article", "law-article");
    const heading = createElement("h3", "", article.content || `제${article.number}조${article.title ? ` (${article.title})` : ""}`);
    wrapper.append(heading);

    if (article.reference) {
      wrapper.append(createElement("small", "law-article-reference", article.reference));
    }

    for (const paragraph of article.paragraphs || []) {
      const paragraphGroup = createElement("div", "law-paragraph");
      paragraphGroup.append(createElement("p", "", [paragraph.number, paragraph.content].filter(Boolean).join(" ")));
      if (paragraph.items?.length) {
        paragraphGroup.append(renderNestedItems(paragraph.items));
      }
      wrapper.append(paragraphGroup);
    }

    wrapper.dataset.search = normalize(wrapper.textContent);
    return wrapper;
  };

  const updateArticleResults = () => {
    if (!articleList || !viewerStatus) {
      return;
    }

    const query = normalize(articleSearch?.value);
    const articles = Array.from(articleList.querySelectorAll(".law-article"));
    let visible = 0;

    for (const article of articles) {
      const matches = !query || String(article.dataset.search || "").includes(query);
      article.hidden = !matches;
      if (matches) {
        visible += 1;
      }
    }

    viewerStatus.textContent = query
      ? `본문에서 ${visible}개 조문이 일치합니다.`
      : `전체 ${articles.length}개 조문을 표시합니다.`;
  };

  const openDetail = async (id, fallbackUrl) => {
    if (!viewer || !viewerTitle || !viewerMeta || !viewerStatus || !articleList) {
      return;
    }

    viewer.hidden = false;
    viewer.setAttribute("aria-busy", "true");
    viewerTitle.textContent = "법령 본문을 불러오는 중입니다…";
    viewerMeta.textContent = "";
    viewerStatus.textContent = "국가법령정보센터에서 조문을 불러오고 있습니다.";
    articleList.replaceChildren();
    if (articleSearch) {
      articleSearch.value = "";
    }
    setSafeOfficialLink(fallbackUrl);
    viewer.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const params = new URLSearchParams({ id: String(id) });
      const data = await apiRequest(`/api/laws/detail?${params.toString()}`);
      const law = data.law || {};
      viewerTitle.textContent = law.name || "법령 본문";
      viewerMeta.textContent = [
        law.kind,
        law.department,
        law.amendmentType,
        formatDate(law.effectiveDate) && `시행 ${formatDate(law.effectiveDate)}`
      ].filter(Boolean).join(" · ");
      setSafeOfficialLink(law.officialUrl || fallbackUrl);

      const fragment = document.createDocumentFragment();
      for (const article of data.articles || []) {
        fragment.append(renderArticle(article));
      }
      articleList.append(fragment);
      updateArticleResults();
    } catch {
      viewerTitle.textContent = "본문을 불러오지 못했습니다";
      viewerStatus.textContent = "실시간 API가 아직 연결되지 않았거나 일시적으로 응답하지 않습니다. 공식 원문 링크에서 확인해 주세요.";
    } finally {
      viewer.setAttribute("aria-busy", "false");
    }
  };

  searchInput.addEventListener("input", updateCuratedResults);

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });

  for (const button of scopeButtons) {
    button.addEventListener("click", () => {
      state.scope = button.dataset.lawScope === "body" ? "body" : "name";
      for (const candidate of scopeButtons) {
        const isActive = candidate === button;
        candidate.classList.toggle("is-active", isActive);
        candidate.setAttribute("aria-pressed", String(isActive));
      }
    });
  }

  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.lawFilter || "all";
      for (const candidate of filterButtons) {
        const isActive = candidate === button;
        candidate.classList.toggle("is-active", isActive);
        candidate.setAttribute("aria-pressed", String(isActive));
      }
      updateCuratedResults();
    });
  }

  for (const link of curatedLinks) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const name = link.dataset.lawName || "";
      const fallbackUrl = link.href;
      searchInput.value = name;
      updateCuratedResults();
      const data = await runSearch({ query: name, scope: "name" });
      const exact = (data?.items || []).find((item) => normalize(item.name) === normalize(name));
      if (exact) {
        openDetail(exact.id, exact.officialUrl || fallbackUrl);
      } else if (viewer && viewerTitle && viewerStatus) {
        viewer.hidden = false;
        viewerTitle.textContent = name;
        viewerStatus.textContent = "화면 내 본문을 불러올 수 없습니다. 공식 원문 링크에서 확인해 주세요.";
        setSafeOfficialLink(fallbackUrl);
        viewer.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  loadMoreButton?.addEventListener("click", () => runSearch({ append: true, query: state.query, scope: state.scope }));
  articleSearch?.addEventListener("input", updateArticleResults);
  viewerClose?.addEventListener("click", () => {
    if (viewer) {
      viewer.hidden = true;
    }
  });

  updateCuratedResults();
})();
