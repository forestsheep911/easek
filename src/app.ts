const TARGET_HASH = '#/ntf/mention'
const BUTTON_ID = 'easek-mark-all-read'
const STYLE_ID = 'easek-mark-all-read-style'
const STATUS_ID = 'easek-dev-status'
const MODAL_ID = 'easek-mark-all-read-modal'
const LOG_PREFIX = '[Easek]'
const INITIAL_MOUNT_DELAY = 3000
const MARK_BATCH_SIZE = 1
const MARK_INTERVAL_MS = 600
const TOKEN_MESSAGE_TYPE = 'easek-request-token-result'
const CLICK_HANDLER_FLAG = 'easekClickHandlerInstalled'

type NotificationMessage = {
  read: boolean
  groupKey?: string
  baseId: string
}

type UnknownRecord = Record<string, unknown>

type NotificationListResponse = {
  result?: {
    ntf?: Array<{
      id?: string
      groupKey?: string
      read?: boolean
      mention?: boolean
    }>
  }
}

type CybozuWindow = Window &
  typeof globalThis & {
    kintone?: {
      getRequestToken?: () => string
    }
    cybozu?: {
      getRequestToken?: () => string
      data?: {
        REQUEST_TOKEN?: string
      }
    }
  }

let capturedRequestToken = ''
let activeButton: HTMLButtonElement | null = null

type ProgressModal = {
  close: () => void
  setBusy: (text: string) => void
  setProgress: (done: number, total: number, text?: string) => void
  setError: (text: string) => void
}

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null
}

const getRequestToken = () => {
  const pageWindow = (globalThis as typeof globalThis & { unsafeWindow?: CybozuWindow }).unsafeWindow
  const kintoneToken = pageWindow?.kintone?.getRequestToken?.()
  if (kintoneToken) {
    return kintoneToken
  }

  const cybozuGetterToken = pageWindow?.cybozu?.getRequestToken?.()
  if (cybozuGetterToken) {
    return cybozuGetterToken
  }

  const cybozuToken = pageWindow?.cybozu?.data?.REQUEST_TOKEN
  if (cybozuToken) {
    return cybozuToken
  }

  if (capturedRequestToken) {
    return capturedRequestToken
  }

  const globalToken = (pageWindow as unknown as UnknownRecord | undefined)?.__REQUEST_TOKEN__
  if (typeof globalToken === 'string') {
    return globalToken
  }

  const tokenInput = document.querySelector<HTMLInputElement>('input[name="__REQUEST_TOKEN__"]')
  if (tokenInput?.value) {
    return tokenInput.value
  }

  const scripts = Array.from(document.scripts)
  for (const script of scripts) {
    const text = script.textContent || ''
    const match = text.match(/__REQUEST_TOKEN__["']?\s*[:=]\s*["']([^"']+)["']/)
    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

const captureRequestToken = (value: unknown) => {
  if (typeof value !== 'string' || !value.includes('__REQUEST_TOKEN__')) {
    return
  }

  const match = value.match(/"__REQUEST_TOKEN__"\s*:\s*"([^"]+)"/)
  if (match?.[1]) {
    capturedRequestToken = match[1]
    log('captured request token from fetch body')
  }
}

const installTokenBridge = () => {
  window.addEventListener('message', (event) => {
    if (event.source !== window || !isRecord(event.data) || event.data.type !== TOKEN_MESSAGE_TYPE) {
      return
    }

    if (typeof event.data.token === 'string' && event.data.token) {
      capturedRequestToken = event.data.token
      log('captured request token from page context')
    }
  })
}

const requestTokenFromPageContext = () => {
  const script = document.createElement('script')
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
  `
  document.documentElement.append(script)
  script.remove()
}

const resolveRequestToken = async () => {
  const immediateToken = getRequestToken()
  if (immediateToken) {
    return immediateToken
  }

  requestTokenFromPageContext()

  for (let index = 0; index < 20; index++) {
    await new Promise((resolve) => window.setTimeout(resolve, 100))

    const token = getRequestToken()
    if (token) {
      return token
    }
  }

  return ''
}

const installTokenCapture = () => {
  const pageWindow = (globalThis as typeof globalThis & { unsafeWindow?: CybozuWindow }).unsafeWindow
  if (!pageWindow) {
    return
  }

  try {
    const originalFetch = pageWindow.fetch.bind(pageWindow)
    pageWindow.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captureRequestToken(typeof init?.body === 'string' ? init.body : undefined)
      return originalFetch(input, init)
    }) as typeof fetch
  } catch (error) {
    log('failed to install fetch token capture', error)
  }
}

const postKintoneApi = async <T>(path: string, body: UnknownRecord): Promise<T> => {
  log('posting kintone api', {
    path,
    body: maskRequestToken(body),
  })

  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${location.origin}${path}${separator}_ref=${encodeURIComponent(location.href)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Kintone API failed: ${path} ${response.status}`)
  }

  return response.json() as Promise<T>
}

const collectMessages = (value: unknown, result: NotificationMessage[] = [], inheritedGroupKey = '') => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMessages(item, result, inheritedGroupKey))
    return result
  }

  if (!isRecord(value)) {
    return result
  }

  const groupKey = typeof value.groupKey === 'string' ? value.groupKey : inheritedGroupKey
  const baseId =
    typeof value.baseId === 'string'
      ? value.baseId
      : typeof value.id === 'string' && groupKey
      ? value.id
      : typeof value.notificationId === 'string' && groupKey
      ? value.notificationId
      : ''

  if (groupKey && baseId) {
    result.push({
      read: true,
      groupKey,
      baseId,
    })
  }

  Object.values(value).forEach((item) => collectMessages(item, result, groupKey))
  return result
}

const getUnreadMentionMessages = async (requestToken: string) => {
  const listResponse = await postKintoneApi<NotificationListResponse>('/k/api/ntf/list.json', {
    checkIgnoreMention: true,
    readType: 'UNREAD',
    mentioned: true,
    checkNew: false,
    __REQUEST_TOKEN__: requestToken,
  })

  log('raw unread list response', listResponse)

  const directMessages =
    listResponse.result?.ntf
      ?.filter((item) => item.read === false && item.mention !== false && item.id && item.groupKey)
      .map((item) => ({
        read: true,
        groupKey: item.groupKey as string,
        baseId: item.id as string,
      })) || []

  if (directMessages.length > 0) {
    return directMessages
  }

  const messages = collectMessages(listResponse)
  const uniqueMessages = new Map<string, NotificationMessage>()
  messages.forEach((message) => {
    uniqueMessages.set(`${message.groupKey}:${message.baseId}`, message)
  })

  return Array.from(uniqueMessages.values())
}

const getUnreadMentionIds = async (requestToken: string) => {
  const countResponse = await postKintoneApi<unknown>('/k/api/ntf/countMention.json?_lc=zh', {
    __REQUEST_TOKEN__: requestToken,
  })

  log('raw unread count response', countResponse)

  if (!isRecord(countResponse) || !isRecord(countResponse.result) || !Array.isArray(countResponse.result.items)) {
    return []
  }

  return countResponse.result.items.filter((item): item is string => typeof item === 'string')
}

const markMessagesRead = async (messages: NotificationMessage[], requestToken: string) => {
  log('mark read payload', {
    messages,
    __REQUEST_TOKEN__: maskToken(requestToken),
  })

  await postKintoneApi('/k/api/ntf/mark.json', {
    messages,
    __REQUEST_TOKEN__: requestToken,
  })
}

const markMessagesReadSlowly = async (messages: NotificationMessage[], requestToken: string, modal: ProgressModal) => {
  let done = 0

  for (let index = 0; index < messages.length; index += MARK_BATCH_SIZE) {
    const batch = messages.slice(index, index + MARK_BATCH_SIZE)
    modal.setProgress(done, messages.length, `标记进度 ${done}/${messages.length}`)
    await markMessagesRead(batch, requestToken)
    done += batch.length
    modal.setProgress(done, messages.length, `标记进度 ${done}/${messages.length}`)

    if (done < messages.length) {
      await wait(MARK_INTERVAL_MS)
    }
  }
}

const setButtonState = (button: HTMLButtonElement, text: string, disabled: boolean) => {
  button.textContent = text
  button.disabled = disabled
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const log = (...args: unknown[]) => {
  console.log(LOG_PREFIX, ...args)
}

const maskToken = (token: string) => {
  if (token.length <= 8) {
    return '***'
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

const maskRequestToken = (body: UnknownRecord) => {
  return {
    ...body,
    __REQUEST_TOKEN__:
      typeof body.__REQUEST_TOKEN__ === 'string' ? maskToken(body.__REQUEST_TOKEN__) : body.__REQUEST_TOKEN__,
  }
}

const isTargetPage = () => {
  return location.hash.startsWith(TARGET_HASH) || location.href.includes('/k/#/ntf/mention')
}

const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${BUTTON_ID} {
      box-sizing: border-box;
      display: inline-block;
      height: 24px;
      margin-left: 8px;
      padding: 0 10px;
      border: 1px solid #c8d6df;
      border-radius: 3px;
      background: #ffffff;
      color: #333333;
      font: 12px/22px Arial, "Microsoft YaHei", sans-serif;
      cursor: pointer;
      vertical-align: middle;
      white-space: nowrap;
    }

    #${BUTTON_ID}:hover {
      background: #f2f7fb;
      border-color: #8db4cf;
    }

    #${BUTTON_ID}:disabled {
      cursor: default;
      opacity: 0.7;
    }

    #${BUTTON_ID}.easek-floating {
      position: fixed;
      top: 84px;
      right: 16px;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
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
  `
  document.head.append(style)
}

const showStatus = (text: string) => {
  if (!document.body) {
    return
  }

  injectStyle()

  const existing = document.getElementById(STATUS_ID)
  if (existing) {
    existing.textContent = text
    return
  }

  const status = document.createElement('div')
  status.id = STATUS_ID
  status.textContent = text
  document.body.append(status)
}

const createProgressModal = (messageText: string, actionsHtml = '') => {
  injectStyle()
  document.getElementById(MODAL_ID)?.remove()

  const modal = document.createElement('div')
  modal.id = MODAL_ID
  modal.innerHTML = `
    <div class="easek-modal-panel" role="dialog" aria-modal="true">
      <p class="easek-modal-title">标记通知为已读</p>
      <p class="easek-modal-message">${messageText}</p>
      <div class="easek-modal-progress"><div class="easek-modal-progress-bar"></div></div>
      <div class="easek-modal-actions">${actionsHtml}</div>
    </div>
  `
  document.body.append(modal)

  const message = modal.querySelector<HTMLElement>('.easek-modal-message')
  const progressBar = modal.querySelector<HTMLElement>('.easek-modal-progress-bar')
  const actions = modal.querySelector<HTMLElement>('.easek-modal-actions')

  modal.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    if (target.dataset.action === 'close') {
      modal.remove()
    }
  })

  const controller: ProgressModal = {
    close: () => modal.remove(),
    setBusy: (text: string) => {
      if (message) {
        message.innerHTML = `<span class="easek-modal-spinner"></span>${text}`
      }
      if (actions) {
        actions.innerHTML = ''
      }
    },
    setProgress: (done: number, total: number, text?: string) => {
      if (message) {
        message.innerHTML = `<span class="easek-modal-spinner"></span><span class="easek-modal-progress-text">${
          text || `标记进度 ${done}/${total}`
        }</span>`
      }
      if (progressBar) {
        progressBar.style.width = `${total === 0 ? 0 : Math.round((done / total) * 100)}%`
      }
    },
    setError: (text: string) => {
      if (message) {
        message.textContent = text
      }
      if (actions) {
        actions.innerHTML =
          '<button class="easek-modal-button easek-modal-button-primary" type="button" data-action="close">关闭</button>'
      }
    },
  }

  return { modal, controller }
}

const showBusyModal = (messageText: string) => {
  return createProgressModal(`<span class="easek-modal-spinner"></span>${messageText}`).controller
}

const showConfirmModal = (count: number) => {
  const { modal, controller } = createProgressModal(
    `发现 ${count} 条“与我相关”的未读通知。是否全部标记为已读？<br>确认后会按 ${MARK_INTERVAL_MS}ms 间隔逐条提交，避免一次性请求过多。`,
    '<button class="easek-modal-button" type="button" data-action="cancel">取消</button><button class="easek-modal-button easek-modal-button-primary" type="button" data-action="start">全部标记为已读</button>',
  )

  const waitForStart = new Promise<boolean>((resolve) => {
    modal.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const action = target.dataset.action
      if (action === 'start') {
        resolve(true)
        return
      }

      if (action === 'cancel' || action === 'close') {
        resolve(false)
        modal.remove()
      }
    })
  })

  return { controller, waitForStart }
}

const handleMarkAllRead = async (button: HTMLButtonElement) => {
  log('mark-all-read clicked')
  setButtonState(button, '准备中...', true)
  const busyModal = showBusyModal('正在读取未读通知...')
  let currentModal = busyModal

  const requestToken = await resolveRequestToken()
  if (!requestToken) {
    setButtonState(button, '缺少 token', false)
    busyModal.setError('没有找到 __REQUEST_TOKEN__，无法调用 kintone 通知 API。')
    return
  }

  try {
    log('request token ready')
    setButtonState(button, '读取中...', true)
    let messages = await getUnreadMentionMessages(requestToken)
    log('unread messages loaded', {
      count: messages.length,
      messages,
    })

    if (messages.length === 0) {
      const ids = await getUnreadMentionIds(requestToken)
      messages = ids.map((baseId) => ({
        read: true,
        baseId,
      }))
      log('unread messages loaded from countMention fallback', {
        count: messages.length,
        messages,
      })
    }

    if (messages.length === 0) {
      setButtonState(button, '没有未读', false)
      busyModal.setError('没有未读通知。')
      window.setTimeout(() => setButtonState(button, '全部已读', false), 1500)
      return
    }

    busyModal.close()
    const { controller: modal, waitForStart } = showConfirmModal(messages.length)
    currentModal = modal
    const shouldStart = await waitForStart
    if (!shouldStart) {
      setButtonState(button, '全部已读', false)
      return
    }

    setButtonState(button, `标记 0/${messages.length}`, true)
    modal.setProgress(0, messages.length, `准备按 ${MARK_INTERVAL_MS}ms 间隔标记 ${messages.length} 条通知...`)
    await markMessagesReadSlowly(messages, requestToken, modal)
    log('mark read api completed')
    setButtonState(button, '已完成', false)
    modal.setProgress(messages.length, messages.length, `已完成，共标记 ${messages.length} 条通知。页面即将刷新。`)
    window.setTimeout(() => {
      modal.close()
      window.location.reload()
    }, 900)
  } catch (error) {
    console.error(error)
    setButtonState(button, '失败，重试', false)
    currentModal.setError(error instanceof Error ? error.message : '标记已读失败')
  }
}

const findMountTarget = () => {
  const readFilter = document.querySelector<HTMLElement>('.ocean-ntf-listheader-readfilter')
  if (readFilter) {
    return {
      target: readFilter,
      position: 'afterend' as const,
      floating: false,
      method: 'readfilter',
    }
  }

  const listHeaderLeft = document.querySelector<HTMLElement>('.ocean-ntf-listheader-left')
  if (listHeaderLeft) {
    return {
      target: listHeaderLeft,
      position: 'beforeend' as const,
      floating: false,
      method: 'listheader-left',
    }
  }

  const listHeader = document.querySelector<HTMLElement>('.ocean-ntf-listheader')
  if (listHeader) {
    return {
      target: listHeader,
      position: 'beforeend' as const,
      floating: false,
      method: 'listheader',
    }
  }

  return {
    target: document.body,
    position: 'beforeend' as const,
    floating: true,
    method: 'floating',
  }
}

const mountButton = () => {
  if (!isTargetPage()) {
    showStatus(`Easek loaded, waiting target page: ${location.hash || '(no hash)'}`)
    return
  }

  if (document.getElementById(BUTTON_ID)) {
    const status = document.getElementById(STATUS_ID)
    status?.remove()
    return
  }

  if (!document.body) {
    return
  }

  injectStyle()

  const mountTarget = findMountTarget()
  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.textContent = '全部已读'
  button.title = '把当前与我相关的未读通知标记为已读'
  if (mountTarget.floating) {
    button.classList.add('easek-floating')
  }
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void handleMarkAllRead(button)
  })

  activeButton = button
  mountTarget.target.insertAdjacentElement(mountTarget.position, button)
  const status = document.getElementById(STATUS_ID)
  status?.remove()
  log(`mounted mark-all-read button by ${mountTarget.method}`, {
    hash: location.hash,
    href: location.href,
  })
}

const installClickHandler = () => {
  const state = window as typeof window & Record<typeof CLICK_HANDLER_FLAG, boolean>
  if (state[CLICK_HANDLER_FLAG]) {
    return
  }
  state[CLICK_HANDLER_FLAG] = true

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const button = target.closest<HTMLButtonElement>(`#${BUTTON_ID}`)
      if (!button) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      void handleMarkAllRead(activeButton || button)
    },
    true,
  )
}

const start = () => {
  installTokenBridge()
  installTokenCapture()
  installClickHandler()
  requestTokenFromPageContext()

  log('loaded', {
    hash: location.hash,
    href: location.href,
    readyState: document.readyState,
    initialMountDelay: INITIAL_MOUNT_DELAY,
  })

  window.setTimeout(() => {
    log('initial delayed mount')
    mountButton()
  }, INITIAL_MOUNT_DELAY)

  window.setInterval(() => {
    mountButton()
  }, 1000)

  const observer = new MutationObserver(() => {
    mountButton()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  window.addEventListener('hashchange', mountButton)
}

const app = () => {
  if (document.body) {
    start()
    return
  }

  log('waiting for document.body', {
    readyState: document.readyState,
    href: location.href,
  })

  const timer = window.setInterval(() => {
    if (!document.body) {
      return
    }

    window.clearInterval(timer)
    start()
  }, 100)
}

export default app
