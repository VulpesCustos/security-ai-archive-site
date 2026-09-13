(() => {
  "use strict";

  const canShowDialog = typeof HTMLDialogElement !== "undefined"
    && typeof HTMLDialogElement.prototype.showModal === "function";
  let viewer;
  let opener;
  let releasePage;
  let imageRequest = 0;

  const imageUrl = (image) => {
    const source = image.currentSrc || image.getAttribute("src");
    if (!source) return null;
    try {
      const url = new URL(source, document.baseURI);
      // Keep local HTTP previews working, but do not turn other schemes into links.
      if (url.protocol === "https:"
        || (url.protocol === "http:" && url.origin === location.origin)) return url.href;
    } catch (_) {
      // An invalid source should leave the ordinary article image unchanged.
    }
    return null;
  };

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const lockPage = (scrollX, scrollY) => {
    const root = document.documentElement;
    const properties = {
      "--article-image-page-top": `${-scrollY}px`,
      "--article-image-page-left": `${-scrollX}px`,
      "--article-image-page-width": `${root.clientWidth}px`
    };
    const previous = Object.keys(properties).map((name) => ({
      name,
      value: root.style.getPropertyValue(name),
      priority: root.style.getPropertyPriority(name)
    }));
    const wasLocked = root.classList.contains("article-image-is-open");
    Object.entries(properties).forEach(([name, value]) => root.style.setProperty(name, value));
    root.classList.add("article-image-is-open");
    return () => {
      if (!wasLocked) root.classList.remove("article-image-is-open");
      previous.forEach(({ name, value, priority }) => {
        if (value) root.style.setProperty(name, value, priority);
        else root.style.removeProperty(name);
      });
      // Override the site's smooth scrolling when restoring the reading position.
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
  };

  const createViewer = () => {
    const dialog = element("dialog", "article-image-dialog");
    dialog.setAttribute("aria-labelledby", "article-image-viewer-title");
    dialog.setAttribute("aria-describedby", "article-image-viewer-help");
    const header = element("div", "article-image-header");
    const title = element("h2", "article-image-title", "이미지 보기");
    title.id = "article-image-viewer-title";
    const close = element("button", "article-image-close", "닫기 ×");
    close.type = "button";
    close.setAttribute("aria-label", "이미지 보기 닫기");
    close.autofocus = true;
    const actions = element("div", "article-image-actions");
    const toggle = element("button", "article-image-toggle", "화면에 맞추기");
    toggle.type = "button";
    const original = element("a", "article-image-original", "원본 파일 열기 ↗");
    original.target = "_blank";
    original.rel = "noopener";
    original.setAttribute("aria-label", "원본 이미지 새 탭에서 열기");
    actions.append(toggle, original);
    header.append(title, close, actions);

    const viewport = element("div", "article-image-viewport");
    viewport.tabIndex = 0;
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", "확대 이미지. 방향키 또는 스크롤로 이동");
    const stage = element("div", "article-image-stage");
    viewport.append(stage);
    const footer = element("div", "article-image-footer");
    const status = element("p", "article-image-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const help = element("p", "article-image-help", "밀거나 스크롤해서 이동하세요. Esc 키로 닫을 수 있습니다.");
    help.id = "article-image-viewer-help";
    footer.append(status, help);
    dialog.append(header, viewport, footer);
    document.body.append(dialog);

    let currentImage;
    let drag;
    let backdropStart = false;

    const refreshPanState = () => {
      viewport.classList.toggle("article-image-can-pan", dialog.dataset.size === "original"
        && (viewport.scrollWidth > viewport.clientWidth || viewport.scrollHeight > viewport.clientHeight));
    };

    const updateSize = (size) => {
      dialog.dataset.size = size;
      toggle.textContent = size === "original" ? "화면에 맞추기" : "원본 크기로 확대";
      viewport.scrollTo({ left: 0, top: 0, behavior: "instant" });
      if (currentImage && currentImage.naturalWidth) {
        const label = size === "original" ? "원본 크기" : "화면에 맞춤";
        status.textContent = `${label} · ${currentImage.naturalWidth} × ${currentImage.naturalHeight}px`;
      }
      refreshPanState();
    };

    const endDrag = () => {
      if (drag && viewport.hasPointerCapture(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
      drag = null;
      viewport.classList.remove("article-image-is-panning");
    };

    close.addEventListener("click", () => dialog.close());
    toggle.addEventListener("click", () => {
      endDrag();
      updateSize(dialog.dataset.size === "original" ? "fit" : "original");
    });

    // Touch uses the browser's own scrolling and pinch zoom; dragging is mouse-only.
    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0
        || !viewport.classList.contains("article-image-can-pan")) return;
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("article-image-is-panning");
      viewport.focus({ preventScroll: true });
      event.preventDefault();
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      viewport.scrollLeft = drag.left - (event.clientX - drag.x);
      viewport.scrollTop = drag.top - (event.clientY - drag.y);
    });
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("lostpointercapture", endDrag);

    const outside = (event) => {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    dialog.addEventListener("pointerdown", (event) => {
      backdropStart = event.button === 0 && outside(event);
    });
    dialog.addEventListener("pointercancel", () => { backdropStart = false; });
    dialog.addEventListener("click", (event) => {
      if (backdropStart && outside(event)) dialog.close();
      backdropStart = false;
    });
    // Native dialog supplies Escape handling, focus containment, and an inert background.
    dialog.addEventListener("close", () => {
      imageRequest += 1;
      endDrag();
      backdropStart = false;
      if (releasePage) releasePage();
      releasePage = null;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
      if (currentImage) currentImage.removeAttribute("src");
      currentImage = null;
      stage.replaceChildren();
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(refreshPanState).observe(viewport);
    else window.addEventListener("resize", refreshPanState);

    return {
      dialog,
      show: (sourceImage, url) => {
        const request = ++imageRequest;
        const enlarged = element("img", "article-image-full");
        currentImage = enlarged;
        enlarged.alt = sourceImage.alt || "";
        enlarged.draggable = false;
        enlarged.decoding = "async";
        enlarged.hidden = true;
        original.href = url;
        toggle.disabled = true;
        viewport.setAttribute("aria-busy", "true");
        status.textContent = "이미지를 불러오는 중입니다…";
        stage.replaceChildren(enlarged);
        updateSize("original");
        let settled = false;
        const complete = (loaded) => {
          if (settled || request !== imageRequest || !dialog.open) return;
          settled = true;
          viewport.setAttribute("aria-busy", "false");
          if (loaded && enlarged.naturalWidth) {
            enlarged.hidden = false;
            toggle.disabled = false;
            updateSize("original");
          } else {
            const error = element("p", "article-image-error", "이미지를 불러오지 못했습니다. 원본 파일을 열어 확인해 주세요.");
            stage.replaceChildren(error);
            status.textContent = "이미지 로드 실패";
          }
        };
        enlarged.addEventListener("load", () => complete(true), { once: true });
        enlarged.addEventListener("error", () => complete(false), { once: true });
        enlarged.src = url;
        if (enlarged.complete) complete(enlarged.naturalWidth > 0);
      }
    };
  };

  const openImage = (link, image, url) => {
    if (!viewer) viewer = createViewer();
    if (viewer.dialog.open) return false;
    const { scrollX, scrollY } = window;
    try {
      viewer.dialog.showModal();
    } catch (_) {
      return false; // The real link remains a fallback if opening the dialog fails.
    }
    opener = link;
    releasePage = lockPage(scrollX, scrollY);
    viewer.show(image, url);
    return true;
  };

  const enhanceImages = () => {
    document.querySelectorAll(".article-content img").forEach((image) => {
      if (image.closest("a, button, [role='button'], [contenteditable]") || image.hasAttribute("usemap")) return;
      const url = imageUrl(image);
      if (!url) return;
      const link = element("a", "article-image-link");
      link.href = url;
      link.title = "원본 이미지 크게 보기";
      link.setAttribute("aria-label", `${image.alt || "이미지"} — 원본 이미지 크게 보기`);
      // Wrap the picture, when present, so its source selection stays intact.
      const content = image.closest("picture") || image;
      content.before(link);
      link.append(content);
      if (!canShowDialog) return;
      link.setAttribute("aria-haspopup", "dialog");
      link.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const selectedUrl = imageUrl(image);
        if (!selectedUrl) return;
        link.href = selectedUrl;
        if (openImage(link, image, selectedUrl)) event.preventDefault();
      });
      // A responsive picture can choose a new resource after orientation changes.
      image.addEventListener("load", () => {
        const selectedUrl = imageUrl(image);
        if (selectedUrl) link.href = selectedUrl;
      });
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhanceImages, { once: true });
  else enhanceImages();
})();
