// ==UserScript==
// @name                easek
// @namespace           https://github.com/forestsheep911/easek
// @version             0.0.1
// @description         Easek Tampermonkey userscript
// @author              forestsheep911
// @copyright           forestsheep911
// @license             MIT
// @match               https://*.cybozu.cn/k/*
// @match               https://*.s.cybozu.cn/k/*
// @match               https://*.cybozu.com/k/*
// @match               https://*.s.cybozu.com/k/*
// @run-at              document-idle
// @supportURL          https://github.com/forestsheep911/easek/issues
// @homepage            https://github.com/forestsheep911/easek
// @grant               unsafeWindow
// @icon                https://raw.githubusercontent.com/forestsheep911/easek/main/public/icon.png
// ==/UserScript==
/* eslint-disable */ /* spell-checker: disable */
// @[ You can find all source codes in GitHub repo ]
(function() {
  "use strict";
  const TARGET_HASHES = ["#/ntf/mention", "#/ntf/all"];
  const BUTTON_ID = "easek-mark-all-read";
  const STYLE_ID = "easek-mark-all-read-style";
  const STATUS_ID = "easek-dev-status";
  const MODAL_ID = "easek-mark-all-read-modal";
  const LOG_PREFIX = "[Easek]";
  const INITIAL_MOUNT_DELAY = 3e3;
  const MARK_INTERVAL_MS = 600;
  const READ_NEXT_BATCH_DELAY_MS = 800;
  const MAX_NOTIFICATION_ROUNDS = 20;
  const DEFAULT_MAX_NOTIFICATIONS_PER_RUN = 1e3;
  const ALL_MAX_NOTIFICATIONS_PER_RUN = 5e3;
  const DEFAULT_MARK_BATCH_SIZE = 1;
  const ALL_MARK_BATCH_SIZE = 20;
  const TOKEN_MESSAGE_TYPE = "easek-request-token-result";
  const CLICK_HANDLER_FLAG = "easekClickHandlerInstalled";
  let capturedRequestToken = "";
  let activeButton = null;
  let featureInstalled = false;
  let mountTimer = 0;
  let retryTimer = 0;
  let targetObserver = null;
  const isRecord = (value) => {
    return typeof value === "object" && value !== null;
  };
  const getRequestToken = () => {
    const pageWindow = globalThis.unsafeWindow;
    const kintoneToken = pageWindow?.kintone?.getRequestToken?.();
    if (kintoneToken) {
      return kintoneToken;
    }
    const cybozuGetterToken = pageWindow?.cybozu?.getRequestToken?.();
    if (cybozuGetterToken) {
      return cybozuGetterToken;
    }
    const cybozuToken = pageWindow?.cybozu?.data?.REQUEST_TOKEN;
    if (cybozuToken) {
      return cybozuToken;
    }
    if (capturedRequestToken) {
      return capturedRequestToken;
    }
    const globalToken = pageWindow?.__REQUEST_TOKEN__;
    if (typeof globalToken === "string") {
      return globalToken;
    }
    const tokenInput = document.querySelector('input[name="__REQUEST_TOKEN__"]');
    if (tokenInput?.value) {
      return tokenInput.value;
    }
    const scripts = Array.from(document.scripts);
    for (const script of scripts) {
      const text = script.textContent || "";
      const match = text.match(/__REQUEST_TOKEN__["']?\s*[:=]\s*["']([^"']+)["']/);
      if (match?.[1]) {
        return match[1];
      }
    }
    return "";
  };
  const captureRequestToken = (value) => {
    if (typeof value !== "string" || !value.includes("__REQUEST_TOKEN__")) {
      return;
    }
    const match = value.match(/"__REQUEST_TOKEN__"\s*:\s*"([^"]+)"/);
    if (match?.[1]) {
      capturedRequestToken = match[1];
      log("captured request token from fetch body");
    }
  };
  const installTokenBridge = () => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || !isRecord(event.data) || event.data.type !== TOKEN_MESSAGE_TYPE) {
        return;
      }
      if (typeof event.data.token === "string" && event.data.token) {
        capturedRequestToken = event.data.token;
        log("captured request token from page context");
      }
    });
  };
  const requestTokenFromPageContext = () => {
    const script = document.createElement("script");
    script.textContent = `
    ;(function () {
      function readToken() {
        var token =
          (window.kintone && typeof window.kintone.getRequestToken === 'function' && window.kintone.getRequestToken()) ||
          (window.cybozu && typeof window.cybozu.getRequestToken === 'function' && window.cybozu.getRequestToken()) ||
          (window.cybozu && window.cybozu.data && window.cybozu.data.REQUEST_TOKEN) ||
          window.__REQUEST_TOKEN__ ||
          ''

        window.postMessage({
          type: '${TOKEN_MESSAGE_TYPE}',
          token: token
        }, window.location.origin)
      }

      readToken()
      window.setTimeout(readToken, 300)
      window.setTimeout(readToken, 1000)
    })()
  `;
    document.documentElement.append(script);
    script.remove();
  };
  const resolveRequestToken = async () => {
    const immediateToken = getRequestToken();
    if (immediateToken) {
      return immediateToken;
    }
    requestTokenFromPageContext();
    for (let index = 0; index < 20; index++) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const token = getRequestToken();
      if (token) {
        return token;
      }
    }
    return "";
  };
  const installTokenCapture = () => {
    const pageWindow = globalThis.unsafeWindow;
    if (!pageWindow) {
      return;
    }
    try {
      const originalFetch = pageWindow.fetch.bind(pageWindow);
      pageWindow.fetch = (input, init) => {
        captureRequestToken(typeof init?.body === "string" ? init.body : void 0);
        return originalFetch(input, init);
      };
    } catch (error) {
      log("failed to install fetch token capture", error);
    }
  };
  const postKintoneApi = async (path, body) => {
    log("posting kintone api", {
      path,
      body: maskRequestToken(body)
    });
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${location.origin}${path}${separator}_ref=${encodeURIComponent(location.href)}`, {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "*/*",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Kintone API failed: ${path} ${response.status}`);
    }
    return response.json();
  };
  const collectMessages = (value, result = [], inheritedGroupKey = "") => {
    if (Array.isArray(value)) {
      value.forEach((item) => collectMessages(item, result, inheritedGroupKey));
      return result;
    }
    if (!isRecord(value)) {
      return result;
    }
    const groupKey = typeof value.groupKey === "string" ? value.groupKey : inheritedGroupKey;
    const baseId = typeof value.baseId === "string" ? value.baseId : typeof value.id === "string" && groupKey ? value.id : typeof value.notificationId === "string" && groupKey ? value.notificationId : "";
    if (groupKey && baseId) {
      result.push({
        read: true,
        groupKey,
        baseId
      });
    }
    Object.values(value).forEach((item) => collectMessages(item, result, groupKey));
    return result;
  };
  const getCurrentNotificationScope = () => {
    return TARGET_HASHES.find((hash) => location.hash.startsWith(hash) || location.href.includes(`/k/${hash}`)) || null;
  };
  const getMaxNotificationsPerRun = (scope) => {
    return scope === "#/ntf/all" ? ALL_MAX_NOTIFICATIONS_PER_RUN : DEFAULT_MAX_NOTIFICATIONS_PER_RUN;
  };
  const getMarkBatchSize = (scope) => {
    return scope === "#/ntf/all" ? ALL_MARK_BATCH_SIZE : DEFAULT_MARK_BATCH_SIZE;
  };
  const getUnreadMessagePage = async (requestToken, scope, baseId = "") => {
    const body = {
      checkIgnoreMention: true,
      readType: "UNREAD",
      __REQUEST_TOKEN__: requestToken
    };
    if (baseId) {
      body.baseId = baseId;
    } else {
      body.checkNew = false;
    }
    if (scope === "#/ntf/mention") {
      body.mentioned = true;
    }
    const listResponse = await postKintoneApi("/k/api/ntf/list.json", body);
    log("raw unread list response", listResponse);
    const directMessages = listResponse.result?.ntf?.filter((item) => {
      if (item.read !== false || !item.id || !item.groupKey) {
        return false;
      }
      return scope === "#/ntf/all" || item.mention !== false;
    }).map((item) => ({
      read: true,
      groupKey: item.groupKey,
      baseId: item.id
    })) || [];
    if (directMessages.length > 0) {
      return {
        messages: directMessages,
        hasMore: listResponse.result?.hasMore === true,
        nextBaseId: listResponse.result?.ntf?.at(-1)?.id || ""
      };
    }
    const messages = collectMessages(listResponse);
    const uniqueMessages = /* @__PURE__ */ new Map();
    messages.forEach((message) => {
      uniqueMessages.set(`${message.groupKey}:${message.baseId}`, message);
    });
    return {
      messages: Array.from(uniqueMessages.values()),
      hasMore: listResponse.result?.hasMore === true,
      nextBaseId: listResponse.result?.ntf?.at(-1)?.id || ""
    };
  };
  const getUnreadMentionIds = async (requestToken) => {
    const countResponse = await postKintoneApi("/k/api/ntf/countMention.json?_lc=zh", {
      __REQUEST_TOKEN__: requestToken
    });
    log("raw unread count response", countResponse);
    if (!isRecord(countResponse) || !isRecord(countResponse.result) || !Array.isArray(countResponse.result.items)) {
      return [];
    }
    return countResponse.result.items.filter((item) => typeof item === "string");
  };
  const markMessagesRead = async (messages, requestToken) => {
    log("mark read payload", {
      messages,
      __REQUEST_TOKEN__: maskToken(requestToken)
    });
    await postKintoneApi("/k/api/ntf/mark.json", {
      messages,
      __REQUEST_TOKEN__: requestToken
    });
  };
  const getMessageKey = (message) => `${message.groupKey || ""}:${message.baseId}`;
  const collectUnreadMessages = async (firstPage, requestToken, scope, modal) => {
    const messagesByKey = /* @__PURE__ */ new Map();
    const maxNotifications = getMaxNotificationsPerRun(scope);
    let page = firstPage;
    let pageIndex = 1;
    while (pageIndex <= MAX_NOTIFICATION_ROUNDS) {
      page.messages.forEach((message) => {
        messagesByKey.set(getMessageKey(message), message);
      });
      const reachedCountLimit = messagesByKey.size >= maxNotifications;
      modal.setBusy(`已读取 ${messagesByKey.size} 条未读通知，正在检查是否还有下一批...`);
      if (!page.hasMore || !page.nextBaseId || pageIndex >= MAX_NOTIFICATION_ROUNDS || reachedCountLimit) {
        return {
          messages: Array.from(messagesByKey.values()).slice(0, maxNotifications),
          reachedLimit: page.hasMore || reachedCountLimit
        };
      }
      await wait(READ_NEXT_BATCH_DELAY_MS);
      page = await getUnreadMessagePage(requestToken, scope, page.nextBaseId);
      pageIndex += 1;
      log("next unread page loaded", {
        scope,
        pageIndex,
        count: page.messages.length,
        hasMore: page.hasMore,
        nextBaseId: page.nextBaseId
      });
    }
    return {
      messages: Array.from(messagesByKey.values()).slice(0, maxNotifications),
      reachedLimit: true
    };
  };
  const markMessagesReadSlowly = async (messages, requestToken, modal, scope, markedBefore = 0) => {
    let done = 0;
    const knownTotal = markedBefore + messages.length;
    const batchSize = getMarkBatchSize(scope);
    for (let index = 0; index < messages.length; index += batchSize) {
      const batch = messages.slice(index, index + batchSize);
      modal.setProgress(markedBefore + done, knownTotal, `标记进度 ${markedBefore + done}/${knownTotal}`);
      await markMessagesRead(batch, requestToken);
      done += batch.length;
      modal.setProgress(markedBefore + done, knownTotal, `标记进度 ${markedBefore + done}/${knownTotal}`);
      if (done < messages.length) {
        await wait(MARK_INTERVAL_MS);
      }
    }
  };
  const markAllUnreadMessages = async (messages, requestToken, modal, scope) => {
    await markMessagesReadSlowly(messages, requestToken, modal, scope);
    return { totalMarked: messages.length, reachedLimit: false };
  };
  const setButtonState = (button, text, disabled) => {
    button.textContent = text;
    button.dataset.disabled = disabled ? "true" : "false";
    button.setAttribute("aria-disabled", disabled ? "true" : "false");
    button.classList.toggle("easek-disabled", disabled);
  };
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const log = (...args) => {
    console.log(LOG_PREFIX, ...args);
  };
  const maskToken = (token) => {
    if (token.length <= 8) {
      return "***";
    }
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  };
  const maskRequestToken = (body) => {
    return {
      ...body,
      __REQUEST_TOKEN__: typeof body.__REQUEST_TOKEN__ === "string" ? maskToken(body.__REQUEST_TOKEN__) : body.__REQUEST_TOKEN__
    };
  };
  const isTargetPage = () => getCurrentNotificationScope() !== null;
  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    #${BUTTON_ID} {
      box-sizing: border-box;
      min-width: 78px;
      margin: 0;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      cursor: pointer;
      white-space: nowrap;
      outline: none;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent;
    }

    #${BUTTON_ID}:hover {
      background: #f7f7f7;
    }

    #${BUTTON_ID}:focus,
    #${BUTTON_ID}:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }

    #${BUTTON_ID}.easek-disabled {
      cursor: default;
      opacity: 0.7;
      pointer-events: none;
    }

    #${BUTTON_ID}.easek-floating {
      position: fixed;
      top: 84px;
      right: 16px;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
    }

    #${BUTTON_ID}.easek-standalone {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      min-width: 88px;
      margin-left: 12px;
      padding: 0 10px;
      border: 1px solid #d7d7d7;
      border-radius: 4px;
      background: #ffffff;
      color: #333333;
      font-size: 12px;
      line-height: 30px;
      vertical-align: middle;
    }

    #${BUTTON_ID}.easek-standalone:hover {
      background: #f7f7f7;
      border-color: #9fc3dd;
    }

    #${STATUS_ID} {
      position: fixed;
      top: 48px;
      right: 16px;
      z-index: 2147483647;
      padding: 6px 8px;
      border-radius: 3px;
      background: #fff8dc;
      border: 1px solid #d7b85b;
      color: #5c4600;
      font: 12px/1.4 Arial, "Microsoft YaHei", sans-serif;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    }

    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.28);
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }

    #${MODAL_ID} .easek-modal-panel {
      width: 360px;
      box-sizing: border-box;
      border: 1px solid #c8d6df;
      border-radius: 6px;
      background: #ffffff;
      color: #333333;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
      padding: 18px;
    }

    #${MODAL_ID} .easek-modal-title {
      margin: 0 0 10px;
      font-size: 15px;
      font-weight: 700;
    }

    #${MODAL_ID} .easek-modal-message {
      min-height: 44px;
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.6;
      text-align: left;
    }

    #${MODAL_ID} .easek-modal-progress {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #edf2f7;
      margin-bottom: 14px;
    }

    #${MODAL_ID} .easek-modal-progress-bar {
      width: 0%;
      height: 100%;
      background: #2f75b5;
      transition: width 0.2s ease;
    }

    #${MODAL_ID} .easek-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #${MODAL_ID} .easek-modal-button {
      min-width: 76px;
      height: 28px;
      border: 1px solid #c8d6df;
      border-radius: 4px;
      background: #ffffff;
      color: #333333;
      cursor: pointer;
    }

    #${MODAL_ID} .easek-modal-button-primary {
      border-color: #2f75b5;
      background: #2f75b5;
      color: #ffffff;
    }

    #${MODAL_ID} .easek-modal-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      border: 2px solid #d7e3ee;
      border-top-color: #2f75b5;
      border-radius: 50%;
      vertical-align: -2px;
      animation: easek-spin 0.8s linear infinite;
    }

    #${MODAL_ID} .easek-modal-progress-text {
      display: inline-block;
      min-width: 150px;
    }

    @keyframes easek-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
    document.head.append(style);
  };
  const createProgressModal = (messageText, actionsHtml = "") => {
    injectStyle();
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.innerHTML = `
    <div class="easek-modal-panel" role="dialog" aria-modal="true">
      <p class="easek-modal-title">标记通知为已读</p>
      <p class="easek-modal-message">${messageText}</p>
      <div class="easek-modal-progress"><div class="easek-modal-progress-bar"></div></div>
      <div class="easek-modal-actions">${actionsHtml}</div>
    </div>
  `;
    document.body.append(modal);
    const message = modal.querySelector(".easek-modal-message");
    const progressBar = modal.querySelector(".easek-modal-progress-bar");
    const actions = modal.querySelector(".easek-modal-actions");
    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.dataset.action === "close") {
        modal.remove();
      }
    });
    const controller = {
      close: () => modal.remove(),
      setBusy: (text) => {
        if (message) {
          message.innerHTML = `<span class="easek-modal-spinner"></span>${text}`;
        }
        if (actions) {
          actions.innerHTML = "";
        }
      },
      setProgress: (done, total, text) => {
        if (message) {
          message.innerHTML = `<span class="easek-modal-spinner"></span><span class="easek-modal-progress-text">${text || `标记进度 ${done}/${total}`}</span>`;
        }
        if (progressBar) {
          progressBar.style.width = `${total === 0 ? 0 : Math.round(done / total * 100)}%`;
        }
      },
      setError: (text) => {
        if (message) {
          message.textContent = text;
        }
        if (actions) {
          actions.innerHTML = '<button class="easek-modal-button easek-modal-button-primary" type="button" data-action="close">关闭</button>';
        }
      }
    };
    return { modal, controller };
  };
  const showBusyModal = (messageText) => {
    return createProgressModal(`<span class="easek-modal-spinner"></span>${messageText}`).controller;
  };
  const showConfirmModal = (count, scope, reachedLimit) => {
    const scopeLabel = scope === "#/ntf/all" ? "全部" : "与我相关";
    const maxNotifications = getMaxNotificationsPerRun(scope);
    const batchSize = getMarkBatchSize(scope);
    const submitText = batchSize > 1 ? `每次最多 ${batchSize} 条` : "逐条";
    const extraText = scope === "#/ntf/all" ? reachedLimit ? `<br>未读通知很多，本次最多处理 ${maxNotifications} 条，完成后可再次点击继续处理后续通知。` : "<br>已预读取当前范围内的全部未读通知。" : "";
    const { modal, controller } = createProgressModal(
      `当前发现 ${count} 条“${scopeLabel}”未读通知。是否标记为已读？${extraText}<br>确认后会按 ${MARK_INTERVAL_MS}ms 间隔${submitText}提交，避免一次性请求过多。`,
      '<button class="easek-modal-button" type="button" data-action="cancel">取消</button><button class="easek-modal-button easek-modal-button-primary" type="button" data-action="start">全部标记为已读</button>'
    );
    const waitForStart = new Promise((resolve) => {
      modal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const action = target.dataset.action;
        if (action === "start") {
          resolve(true);
          return;
        }
        if (action === "cancel" || action === "close") {
          resolve(false);
          modal.remove();
        }
      });
    });
    return { controller, waitForStart };
  };
  const handleMarkAllRead = async (button) => {
    if (button.dataset.disabled === "true") {
      return;
    }
    const scope = getCurrentNotificationScope();
    if (!scope) {
      return;
    }
    log("mark-all-read clicked");
    setButtonState(button, "准备中...", true);
    const busyModal = showBusyModal("正在读取未读通知...");
    let currentModal = busyModal;
    const requestToken = await resolveRequestToken();
    if (!requestToken) {
      setButtonState(button, "缺少 token", false);
      busyModal.setError("没有找到 __REQUEST_TOKEN__，无法调用 kintone 通知 API。");
      return;
    }
    try {
      log("request token ready");
      setButtonState(button, "读取中...", true);
      const firstPage = await getUnreadMessagePage(requestToken, scope);
      let messages = firstPage.messages;
      let reachedReadLimit = false;
      log("unread messages loaded", {
        scope,
        count: messages.length,
        hasMore: firstPage.hasMore,
        nextBaseId: firstPage.nextBaseId,
        messages
      });
      if (scope === "#/ntf/mention" && messages.length === 0) {
        const ids = await getUnreadMentionIds(requestToken);
        messages = ids.map((baseId) => ({
          read: true,
          baseId
        }));
        log("unread messages loaded from countMention fallback", {
          scope,
          count: messages.length,
          messages
        });
      }
      if (scope === "#/ntf/all" && messages.length > 0 && firstPage.hasMore) {
        const allUnread = await collectUnreadMessages(firstPage, requestToken, scope, busyModal);
        messages = allUnread.messages;
        reachedReadLimit = allUnread.reachedLimit;
        log("all unread pages collected", {
          scope,
          count: messages.length,
          reachedLimit: allUnread.reachedLimit
        });
        if (allUnread.reachedLimit) {
          busyModal.setBusy(`已读取 ${messages.length} 条未读通知，达到本次处理保护上限。`);
        }
      }
      if (messages.length === 0) {
        setButtonState(button, "没有未读", false);
        busyModal.setError("没有未读通知。");
        window.setTimeout(() => setButtonState(button, "全部已读", false), 1500);
        return;
      }
      busyModal.close();
      const { controller: modal, waitForStart } = showConfirmModal(messages.length, scope, reachedReadLimit);
      currentModal = modal;
      const shouldStart = await waitForStart;
      if (!shouldStart) {
        setButtonState(button, "全部已读", false);
        return;
      }
      setButtonState(button, "标记中...", true);
      modal.setProgress(0, messages.length, `准备按 ${MARK_INTERVAL_MS}ms 间隔标记 ${messages.length} 条通知...`);
      const result = await markAllUnreadMessages(messages, requestToken, modal, scope);
      log("mark read api completed");
      setButtonState(button, "已完成", false);
      modal.setProgress(
        result.totalMarked,
        result.totalMarked,
        reachedReadLimit || result.reachedLimit ? `已完成本次上限，共标记 ${result.totalMarked} 条通知。页面即将刷新，后续可再次点击继续处理。` : `已完成，共标记 ${result.totalMarked} 条通知。页面即将刷新。`
      );
      window.setTimeout(() => {
        modal.close();
        window.location.reload();
      }, 900);
    } catch (error) {
      console.error(error);
      setButtonState(button, "失败，重试", false);
      currentModal.setError(error instanceof Error ? error.message : "标记已读失败");
    }
  };
  const findNewDesignBulkOperationTarget = () => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    for (const switchButton of switches) {
      const container = switchButton.closest("[data-disabled]");
      const label = container?.querySelector("label");
      if (label?.textContent?.trim() !== "批量操作") {
        continue;
      }
      const option = container?.parentElement;
      if (option) {
        return option;
      }
    }
    const labels = Array.from(document.querySelectorAll("label")).filter(
      (label) => label.textContent?.trim() === "批量操作"
    );
    for (const label of labels) {
      const option = label.closest('[class*="option"], [class*="container"]');
      if (option) {
        return option.parentElement || option;
      }
    }
    return null;
  };
  const findMountTarget = () => {
    const readToggle = document.querySelector(".gaia-argoui-ntf-readtoggleswitch");
    if (readToggle) {
      return {
        target: readToggle,
        position: "beforeend",
        floating: false,
        method: "read-toggle"
      };
    }
    const newDesignBulkOperation = findNewDesignBulkOperationTarget();
    if (newDesignBulkOperation) {
      return {
        target: newDesignBulkOperation,
        position: "afterend",
        floating: false,
        method: "new-design-bulk-operation"
      };
    }
    const newDesignTrialButton = document.querySelector(".gaia-argoui-ntf-new-design-header");
    if (newDesignTrialButton?.parentElement) {
      return {
        target: newDesignTrialButton,
        position: "beforebegin",
        floating: false,
        method: "new-design-trial-button"
      };
    }
    const newNotificationHeader = document.querySelector(
      '[class*="ntf"][class*="header"], [class*="notification"][class*="header"]'
    );
    if (newNotificationHeader) {
      return {
        target: newNotificationHeader,
        position: "beforeend",
        floating: false,
        method: "notification-header"
      };
    }
    const readFilter = document.querySelector(".ocean-ntf-listheader-readfilter");
    if (readFilter) {
      return {
        target: readFilter,
        position: "afterend",
        floating: false,
        method: "readfilter"
      };
    }
    const listHeaderLeft = document.querySelector(".ocean-ntf-listheader-left");
    if (listHeaderLeft) {
      return {
        target: listHeaderLeft,
        position: "beforeend",
        floating: false,
        method: "listheader-left"
      };
    }
    const listHeader = document.querySelector(".ocean-ntf-listheader");
    if (listHeader) {
      return {
        target: listHeader,
        position: "beforeend",
        floating: false,
        method: "listheader"
      };
    }
    return {
      target: document.body,
      position: "beforeend",
      floating: true,
      method: "floating"
    };
  };
  const mountButton = () => {
    if (!isTargetPage()) {
      activeButton?.remove();
      activeButton = null;
      document.getElementById(STATUS_ID)?.remove();
      return;
    }
    if (document.getElementById(BUTTON_ID)) {
      const status2 = document.getElementById(STATUS_ID);
      status2?.remove();
      return;
    }
    if (!document.body) {
      return;
    }
    injectStyle();
    const mountTarget = findMountTarget();
    const button = document.createElement("div");
    button.id = BUTTON_ID;
    button.className = "gaia-argoui-toggleswitch-option";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-disabled", "false");
    button.dataset.disabled = "false";
    button.textContent = "全部已读";
    button.title = "把当前与我相关的未读通知标记为已读";
    if (mountTarget.floating) {
      button.classList.add("easek-floating");
    }
    if (mountTarget.method !== "read-toggle") {
      button.classList.add("easek-standalone");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleMarkAllRead(button);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void handleMarkAllRead(button);
    });
    activeButton = button;
    mountTarget.target.insertAdjacentElement(mountTarget.position, button);
    const status = document.getElementById(STATUS_ID);
    status?.remove();
    log(`mounted mark-all-read button by ${mountTarget.method}`, {
      hash: location.hash,
      href: location.href
    });
  };
  const scheduleMount = (delay = 0) => {
    window.clearTimeout(mountTimer);
    mountTimer = window.setTimeout(() => {
      mountTimer = 0;
      mountButton();
    }, delay);
  };
  const installClickHandler = () => {
    const state = window;
    if (state[CLICK_HANDLER_FLAG]) {
      return;
    }
    state[CLICK_HANDLER_FLAG] = true;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest(`#${BUTTON_ID}`);
        if (!button) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void handleMarkAllRead(activeButton || button);
      },
      true
    );
  };
  const installFeature = () => {
    if (featureInstalled) {
      return;
    }
    featureInstalled = true;
    installTokenBridge();
    installTokenCapture();
    installClickHandler();
  };
  const enterTargetPage = () => {
    installFeature();
    requestTokenFromPageContext();
    log("target page active", {
      hash: location.hash,
      href: location.href,
      readyState: document.readyState,
      initialMountDelay: INITIAL_MOUNT_DELAY
    });
    mountButton();
    if (!retryTimer) {
      retryTimer = window.setInterval(() => {
        if (!isTargetPage()) {
          return;
        }
        if (!document.getElementById(BUTTON_ID)) {
          scheduleMount();
        }
      }, 1e3);
    }
    if (!targetObserver && document.body) {
      targetObserver = new MutationObserver(() => {
        if (!isTargetPage() || document.getElementById(BUTTON_ID)) {
          return;
        }
        scheduleMount(100);
      });
      targetObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    window.setTimeout(() => {
      log("initial delayed mount");
      scheduleMount();
    }, INITIAL_MOUNT_DELAY);
  };
  const leaveTargetPage = () => {
    window.clearTimeout(mountTimer);
    mountTimer = 0;
    window.clearInterval(retryTimer);
    retryTimer = 0;
    targetObserver?.disconnect();
    targetObserver = null;
    activeButton?.remove();
    activeButton = null;
    document.getElementById(STATUS_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
  };
  const syncRoute = () => {
    if (isTargetPage()) {
      enterTargetPage();
      return;
    }
    leaveTargetPage();
  };
  const start = () => {
    log("loaded", {
      hash: location.hash,
      href: location.href,
      readyState: document.readyState,
      initialMountDelay: INITIAL_MOUNT_DELAY
    });
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
  };
  const app = () => {
    if (document.body) {
      start();
      return;
    }
    log("waiting for document.body", {
      readyState: document.readyState,
      href: location.href
    });
    const timer = window.setInterval(() => {
      if (!document.body) {
        return;
      }
      window.clearInterval(timer);
      start();
    }, 100);
  };
  {
    app();
  }
})();
