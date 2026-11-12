/**
 * デッキの発表のための操作。src/layouts/Deck.astro から一度だけ呼ぶ。
 *
 * 横長の画面で JavaScript が動くときだけ、スライドを 1 枚ずつ表示する（発表の表示）。縦長の画面と、
 * JavaScript が動かない環境では、HTML のとおり縦に並べて読む形のままにする（DESIGN.md の「枠」）。
 * URL に ?presenter が付いていれば、画面の向きにかかわらず発表者ビューにする。
 *
 * 状態は、CSS が選べるよう、デッキのルート、スライド、操作の部分の属性で表す。
 * キーで切り替えるものには動きを付けない（DESIGN.md の「動かしてよい場面」）ので、ここでは属性を書き換えるだけにし、
 * transition やアニメーションを起こさない。
 */
import { getColorScheme, onStoredColorSchemeChange, toggleColorScheme } from './theme'

/** CSS の横長の画面の条件と同じにする。幅と高さを比べ、orientation は使わない */
const LANDSCAPE_QUERY = '(aspect-ratio >= 1)'
/** DESIGN.md の「操作の部分」の、マウスを止めてから隠すまでの時間 */
const IDLE_DELAY_MS = 2000
/** これより短い横の動きは、スワイプではなくタップの揺れとみなす */
const SWIPE_MIN_PX = 50
const PRESENTER_PARAM = 'presenter'
/** 発表者ビューを何度開いても、同じウィンドウを使い回すための名前 */
const PRESENTER_WINDOW_NAME = 'slide-creator-presenter'

type View = 'scroll' | 'present' | 'presenter'
type Action = 'prev' | 'next' | 'notes' | 'fullscreen' | 'presenter' | 'theme' | 'reset-timer'

interface SlideMessage {
	type: 'slide'
	/** 1 から数えたページ番号。ハッシュと同じ数え方にする */
	page: number
}

const isSlideMessage = (data: unknown): data is SlideMessage =>
	typeof data === 'object' &&
	data !== null &&
	'type' in data &&
	data.type === 'slide' &&
	'page' in data &&
	typeof data.page === 'number' &&
	Number.isInteger(data.page)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** `#3` を 0 から数えた番号にする。数でないハッシュは 1 枚目に、範囲の外は 1 枚目か最後に寄せる */
const indexFromHash = (hash: string, total: number) => {
	const match = /^#(\d+)$/.exec(hash)
	if (!match?.[1]) return 0
	return clamp(Number.parseInt(match[1], 10), 1, total) - 1
}

/** 入力欄の中では、文字の入力と矢印キーの移動をそのまま通す */
const isEditable = (target: EventTarget | null) =>
	target instanceof Element &&
	target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null

/** ボタンやリンクの上のスペースとクリックは、その要素の操作を優先する */
const isInteractive = (target: EventTarget | null) =>
	target instanceof Element &&
	target.closest('a[href], button, summary, label, input, textarea, select, [contenteditable], [tabindex]') !== null

const formatElapsed = (ms: number) => {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return {
		text: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
		datetime: `PT${minutes}M${seconds}S`,
	}
}

const queryHTMLElement = (root: ParentNode, selector: string) => {
	const element = root.querySelector(selector)
	return element instanceof HTMLElement ? element : null
}

export const initDeck = (): void => {
	const deck = queryHTMLElement(document, '.deck')
	if (!deck) return
	const slides = Array.from(deck.querySelectorAll(':scope > .slide')).filter(
		(element): element is HTMLElement => element instanceof HTMLElement,
	)
	const total = slides.length
	if (total === 0) return

	const controls = queryHTMLElement(document, '.deck-controls')
	const timer = queryHTMLElement(document, '.presenter-timer')
	const button = (action: Action) => queryHTMLElement(document, `[data-action="${action}"]`)
	const currentLabel = queryHTMLElement(document, '[data-deck-current]')
	const totalLabel = queryHTMLElement(document, '[data-deck-total]')

	const isPresenter = new URLSearchParams(location.search).has(PRESENTER_PARAM)
	const landscape = matchMedia(LANDSCAPE_QUERY)
	const channel =
		typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`slide-creator:${location.pathname}`)

	let view: View = 'scroll'
	let index = indexFromHash(location.hash, total)
	let notesShown = false

	if (totalLabel) totalLabel.textContent = String(total)

	// ---- 今のスライド ----

	const renderSlides = () => {
		slides.forEach((slide, i) => {
			if (view === 'scroll') {
				slide.hidden = false
				slide.inert = false
				delete slide.dataset.slide
				return
			}
			const isCurrent = i === index
			// 発表者ビューでは次のスライドを見せるが、見るだけのものなので操作できないようにする
			const isNext = view === 'presenter' && i === index + 1
			// 見えないスライドは hidden で隠す。CSS がなくても、フォーカスと読み上げの対象から外れるため
			slide.hidden = !isCurrent && !isNext
			slide.inert = isNext
			if (isCurrent) slide.dataset.slide = 'current'
			else if (isNext) slide.dataset.slide = 'next'
			else delete slide.dataset.slide
		})
	}

	const renderProgress = () => {
		const page = index + 1
		if (currentLabel) currentLabel.textContent = String(page)
		// 操作の部分は main.deck の外にあるので、両方に継承されるよう文書のルートに書く
		document.documentElement.style.setProperty('--deck--progress', String(page / total))
		button('prev')?.setAttribute('aria-disabled', String(index === 0))
		button('next')?.setAttribute('aria-disabled', String(index === total - 1))
	}

	const writeHash = () => {
		const hash = `#${index + 1}`
		// 移動のたびに履歴を積むと、ブラウザの戻るでデッキの外に出られなくなるので置き換える
		if (location.hash !== hash) history.replaceState(history.state, '', hash)
	}

	const goTo = (next: number, { broadcast = true } = {}) => {
		const clamped = clamp(next, 0, total - 1)
		if (view === 'scroll') {
			index = clamped
			return
		}
		if (clamped === index) {
			// 最後のスライドで #99 を入れたときのように、スライドは同じでもハッシュが範囲の外のことがあるので、書き直す
			writeHash()
			return
		}
		index = clamped
		renderSlides()
		renderProgress()
		writeHash()
		// この規則は window.postMessage の送り先の検査で、送り先が同じオリジンに限られる BroadcastChannel には当たらない
		// oxlint-disable-next-line unicorn/require-post-message-target-origin
		if (broadcast) channel?.postMessage({ type: 'slide', page: index + 1 } satisfies SlideMessage)
	}

	channel?.addEventListener('message', (event) => {
		if (!isSlideMessage(event.data)) return
		goTo(event.data.page - 1, { broadcast: false })
	})

	// アドレスバーでハッシュを書き換えたときも、そのスライドへ移る
	window.addEventListener('hashchange', () => {
		if (view !== 'scroll') goTo(indexFromHash(location.hash, total))
	})

	// ---- ノート ----

	const renderNotes = () => {
		if (view === 'scroll') delete deck.dataset.notes
		// 発表者ビューは、ノートを読むための画面なので常に出す
		else deck.dataset.notes = view === 'presenter' || notesShown ? 'shown' : 'hidden'
		button('notes')?.setAttribute('aria-pressed', String(notesShown))
	}

	const toggleNotes = () => {
		notesShown = !notesShown
		renderNotes()
	}

	// ---- 全画面 ----

	const fullscreenButton = button('fullscreen')
	if (fullscreenButton) fullscreenButton.hidden = !document.fullscreenEnabled

	const toggleFullscreen = () => {
		if (!document.fullscreenEnabled) return
		// 利用者の操作から呼ばれていないときなどに拒まれる。拒まれても表示は変わらないので、何もしない
		const request = document.fullscreenElement
			? document.exitFullscreen()
			: document.documentElement.requestFullscreen()
		request.catch(() => {})
	}

	document.addEventListener('fullscreenchange', () => {
		fullscreenButton?.setAttribute('aria-pressed', String(document.fullscreenElement !== null))
	})

	// ---- 発表者ビュー ----

	const openPresenter = () => {
		const url = new URL(location.href)
		url.search = PRESENTER_PARAM
		url.hash = String(index + 1)
		// popup を指定し、タブではなく別のウィンドウで開く。発表の画面と並べて、別の画面に置くため
		window.open(url, PRESENTER_WINDOW_NAME, 'popup')
	}

	let timerStart = Date.now()
	const elapsed = timer ? queryHTMLElement(timer, 'time') : null

	const renderTimer = () => {
		if (!elapsed) return
		const { text, datetime } = formatElapsed(Date.now() - timerStart)
		elapsed.textContent = text
		elapsed.setAttribute('datetime', datetime)
	}

	const resetTimer = () => {
		timerStart = Date.now()
		renderTimer()
	}

	// ---- テーマ ----

	const renderTheme = () => {
		button('theme')?.setAttribute('aria-pressed', String(getColorScheme() === 'dark only'))
	}
	onStoredColorSchemeChange(renderTheme)

	// ---- 表示の切り替え ----

	const setView = (next: View) => {
		const previous = view
		view = next
		if (view === 'scroll') delete deck.dataset.view
		else deck.dataset.view = view
		if (controls) controls.hidden = view === 'scroll'
		if (timer) timer.hidden = view !== 'presenter'
		// 発表者ビューから、さらに発表者ビューを開いたり、ノートを隠したりする意味はないので、ボタンを出さない
		for (const action of ['notes', 'presenter'] as const) {
			const element = button(action)
			if (element) element.hidden = view === 'presenter'
		}
		renderSlides()
		renderProgress()
		renderNotes()
		renderTheme()
		if (view !== 'scroll') {
			writeHash()
			wake()
		} else if (previous !== 'scroll') {
			// 縦に並べる形に戻ったとき、発表の表示で見ていたスライドから読めるようにする
			slides[index]?.scrollIntoView({ block: 'start', behavior: 'instant' })
		}
	}

	// ---- 操作の部分を隠す ----

	let idleTimeout: ReturnType<typeof setTimeout> | undefined

	const sleep = () => {
		// キーボードで操作の部分にいる人から、操作の部分を隠さない
		if (!controls || controls.querySelector(':focus-visible')) return
		controls.toggleAttribute('data-idle', true)
	}

	function wake() {
		if (!controls) return
		controls.removeAttribute('data-idle')
		clearTimeout(idleTimeout)
		idleTimeout = setTimeout(sleep, IDLE_DELAY_MS)
	}

	// タッチの画面にはマウスの動きがないので、触れたときにも出す
	document.addEventListener('pointermove', () => {
		if (view !== 'scroll') wake()
	})
	document.addEventListener('pointerdown', () => {
		if (view !== 'scroll') wake()
	})
	controls?.addEventListener('focusin', () => {
		if (controls.querySelector(':focus-visible')) controls.removeAttribute('data-idle')
	})
	// フォーカスが操作の部分を出たら、そこから 2 秒で隠す
	controls?.addEventListener('focusout', () => {
		if (view !== 'scroll') wake()
	})

	// ---- 操作 ----

	const run = (action: Action) => {
		switch (action) {
			case 'prev':
				goTo(index - 1)
				break
			case 'next':
				goTo(index + 1)
				break
			case 'notes':
				if (view === 'present') toggleNotes()
				break
			case 'fullscreen':
				toggleFullscreen()
				break
			case 'presenter':
				if (view === 'present') openPresenter()
				break
			case 'theme':
				toggleColorScheme()
				renderTheme()
				break
			case 'reset-timer':
				resetTimer()
				break
		}
	}

	const ACTIONS: readonly Action[] = ['prev', 'next', 'notes', 'fullscreen', 'presenter', 'theme', 'reset-timer']
	const isAction = (value: unknown): value is Action => ACTIONS.some((action) => action === value)

	document.addEventListener('click', (event) => {
		if (!(event.target instanceof Element)) return
		const target = event.target.closest('[data-action]')
		const action = target?.getAttribute('data-action')
		if (!target || !isAction(action) || target.getAttribute('aria-disabled') === 'true') return
		run(action)
	})

	document.addEventListener('keydown', (event) => {
		if (view === 'scroll') return
		// Ctrl、Cmd、Alt との組み合わせは、ブラウザと OS のショートカットに残す
		if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
		if (isEditable(event.target)) return

		let action: Action | 'first' | 'last' | undefined
		switch (event.key) {
			case 'ArrowRight':
			case 'PageDown':
				action = 'next'
				break
			case 'ArrowLeft':
			case 'PageUp':
				action = 'prev'
				break
			case ' ':
				if (isInteractive(event.target)) return
				action = event.shiftKey ? 'prev' : 'next'
				break
			case 'Home':
				action = 'first'
				break
			case 'End':
				action = 'last'
				break
			default:
				action = (
					{ n: 'notes', f: 'fullscreen', p: 'presenter', d: 'theme' } as const satisfies Record<string, Action>
				)[event.key.toLowerCase()]
		}
		if (!action) return
		event.preventDefault()
		if (action === 'first') goTo(0)
		else if (action === 'last') goTo(total - 1)
		else run(action)
	})

	// ---- タップとスワイプ ----

	let swipeStart: { id: number; x: number; y: number } | null = null
	// スワイプのあとに続くクリックを、タップとして数えない
	let suppressClick = false

	deck.addEventListener('pointerdown', (event) => {
		suppressClick = false
		if (event.pointerType === 'mouse' || !event.isPrimary) return
		swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
	})
	deck.addEventListener('pointercancel', () => {
		swipeStart = null
	})
	deck.addEventListener('pointerup', (event) => {
		if (view !== 'present' || !swipeStart || event.pointerId !== swipeStart.id) return
		const dx = event.clientX - swipeStart.x
		const dy = event.clientY - swipeStart.y
		swipeStart = null
		if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return
		suppressClick = true
		// 指を左へ動かすと、紙をめくるように次へ進む
		goTo(dx < 0 ? index + 1 : index - 1)
	})

	deck.addEventListener('click', (event) => {
		if (view !== 'present' || event.button !== 0) return
		if (suppressClick) {
			suppressClick = false
			return
		}
		if (isInteractive(event.target)) return
		// 文字を選んだ操作は、移動に数えない
		if (getSelection()?.isCollapsed === false) return
		const isLeftThird = event.clientX < document.documentElement.clientWidth / 3
		goTo(isLeftThird ? index - 1 : index + 1)
	})

	// ---- 始める ----

	if (isPresenter) {
		// 表示は経過時間から毎回計算するので、間隔がずれても表示の誤差は積もらない
		setInterval(renderTimer, 1000)
		resetTimer()
		setView('presenter')
	} else {
		setView(landscape.matches ? 'present' : 'scroll')
		landscape.addEventListener('change', (event) => {
			setView(event.matches ? 'present' : 'scroll')
		})
	}
}
