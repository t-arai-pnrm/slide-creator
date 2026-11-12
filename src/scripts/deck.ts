/**
 * デッキの発表のための操作。src/layouts/Deck.astro から一度だけ呼ぶ。
 *
 * 横長の画面で JavaScript が動くときだけ、スライドを 1 枚ずつ表示する（発表の表示）。縦長の画面と、
 * JavaScript が動かない環境では、HTML のとおり縦に並べて読む形のままにする（DESIGN.md の「枠」）。
 * URL に ?presenter が付いていれば、画面の向きにかかわらず発表者ビューにする。
 * 印刷の間は、すべてのスライドを紙に出すため、どの表示からでも縦に並べる形にする。
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
type Action =
	| 'prev'
	| 'next'
	| 'notes'
	| 'fullscreen'
	| 'presenter'
	| 'theme'
	| 'timer-play'
	| 'timer-pause'
	| 'timer-stop'

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

/** 見える数字は分 2 桁なので、99 分 59 秒が出せる最大の値 */
const MAX_SHOWN_SECONDS = 99 * 60 + 59

const formatElapsed = (ms: number) => {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	// 99 分を超えたら、見える数字は 99:59 で止め、読み上げの文字と datetime は実際の値を書き続ける。
	// 3 桁目を足すと発表の途中でカードの幅が変わり、00:00 へ巡回させると始めたばかりと見誤るため。
	// 登壇の多くは 99 分に収まるので、止まった数字は時間を大きく過ぎた合図として読める
	const shownSeconds = Math.min(totalSeconds, MAX_SHOWN_SECONDS)
	const shown = `${String(Math.floor(shownSeconds / 60)).padStart(2, '0')}${String(shownSeconds % 60).padStart(2, '0')}`
	return {
		/** 見える 4 桁（分 2 桁、秒 2 桁）の値 */
		digits: Array.from(shown, Number),
		text: `${minutes} 分 ${seconds} 秒`,
		datetime: `PT${minutes}M${seconds}S`,
	}
}

/** ノートの領域（とその中）か。ノートは今のスライドで tabindex を持ち、フォーカスしてスクロールする */
const isInNotes = (target: EventTarget | null) =>
	target instanceof Element && target.closest('.slide > ._notes') !== null

/** ノートの中では、ノートのスクロールに残すキー。ページ単位のスクロールと、端までのスクロールに使う */
const NOTES_SCROLL_KEYS: ReadonlySet<string> = new Set(['PageDown', 'PageUp', 'Home', 'End'])

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
	// 印刷の間は、表示を縦に並べる形に替える。kiso.css の [hidden] の display: none !important は印刷でも当たり、
	// 発表の表示のまま印刷すると、今のスライドしか紙に出ないため。view は替えず、印刷が終われば元の表示に戻す
	let printing = false
	/** 画面に出す形。印刷の間だけ、view にかかわらず縦に並べる形にする */
	const shownView = (): View => (printing ? 'scroll' : view)

	if (totalLabel) totalLabel.textContent = String(total)

	// ---- 今のスライド ----

	const renderSlides = () => {
		const shown = shownView()
		slides.forEach((slide, i) => {
			if (shown === 'scroll') {
				slide.hidden = false
				slide.inert = false
				delete slide.dataset.slide
				return
			}
			const isCurrent = i === index
			// 発表者ビューでは前と次のスライドを見せるが、見るだけのものなので操作できないようにする
			const isPrev = shown === 'presenter' && i === index - 1
			const isNext = shown === 'presenter' && i === index + 1
			// 見えないスライドは hidden で隠す。CSS がなくても、フォーカスと読み上げの対象から外れるため
			slide.hidden = !isCurrent && !isPrev && !isNext
			slide.inert = isPrev || isNext
			if (isCurrent) slide.dataset.slide = 'current'
			else if (isPrev) slide.dataset.slide = 'prev'
			else if (isNext) slide.dataset.slide = 'next'
			else delete slide.dataset.slide
		})
		// ノートの tabindex="0" は、長いノートを領域の中でスクロールさせる表示（発表の表示と発表者ビュー）の、今のスライドにだけ付ける。
		// 縦に並べる形で付けると、ノートのあるスライドごとに Tab の止まる場所が増えるため（src/components/Slide.astro）
		slides.forEach((slide, i) => {
			const notes = queryHTMLElement(slide, ':scope > ._notes')
			if (!notes) return
			if (shown !== 'scroll' && i === index) notes.tabIndex = 0
			else notes.removeAttribute('tabindex')
		})
	}

	const renderProgress = () => {
		const page = index + 1
		if (currentLabel) currentLabel.textContent = String(page)
		// 操作の部分は main.deck の外にあるので、両方に継承されるよう文書のルートに書く
		document.documentElement.style.setProperty('--deck-controls--progress', String(page / total))
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

	/** 縦に並べる形で、今のスライドまでスクロールする。スライドに id はないので、ブラウザはハッシュの位置へ動かさない */
	const scrollToCurrent = () => {
		slides[index]?.scrollIntoView({ block: 'start', behavior: 'instant' })
	}

	// アドレスバーでハッシュを書き換えたときも、そのスライドへ移る
	window.addEventListener('hashchange', () => {
		const next = indexFromHash(location.hash, total)
		if (view !== 'scroll') {
			goTo(next)
			return
		}
		index = next
		scrollToCurrent()
	})

	// ---- ノート ----

	const renderNotes = () => {
		const shown = shownView()
		if (shown === 'scroll') delete deck.dataset.notes
		// 発表者ビューは、ノートを読むための画面なので常に出す
		else deck.dataset.notes = shown === 'presenter' || notesShown ? 'shown' : 'hidden'
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

	// 経過時間は、一時停止までに数えた分と、今動いている区間（始めた時刻から今まで）の和で持つ。
	// 1 秒ごとに足していくと、setInterval の遅れが積もるため
	let timerCounted = 0
	/** 動いている区間を始めた時刻。止まっている間は null */
	let timerRunningSince: number | null = null
	const timerElapsed = () => timerCounted + (timerRunningSince === null ? 0 : Date.now() - timerRunningSince)
	const elapsed = timer ? queryHTMLElement(timer, 'time') : null
	const timerDigits = timer
		? Array.from(timer.querySelectorAll('[data-timer-digit]')).filter(
				(element): element is HTMLElement => element instanceof HTMLElement,
			)
		: []

	const renderTimer = () => {
		const { digits, text, datetime } = formatElapsed(timerElapsed())
		if (elapsed) {
			elapsed.textContent = text
			elapsed.setAttribute('datetime', datetime)
		}
		timerDigits.forEach((digit, i) => {
			digit.style.setProperty('--_value', String(digits[i] ?? 0))
		})
	}

	/** 今の状態で押せないボタンを aria-disabled にする */
	const renderTimerButtons = () => {
		const running = timerRunningSince !== null
		const atZero = !running && timerCounted === 0
		button('timer-play')?.setAttribute('aria-disabled', String(running))
		button('timer-pause')?.setAttribute('aria-disabled', String(!running))
		button('timer-stop')?.setAttribute('aria-disabled', String(atZero))
	}

	const playTimer = () => {
		if (timerRunningSince !== null) return
		timerRunningSince = Date.now()
		renderTimerButtons()
		renderTimer()
	}

	const pauseTimer = () => {
		if (timerRunningSince === null) return
		timerCounted = timerElapsed()
		timerRunningSince = null
		renderTimerButtons()
		renderTimer()
	}

	const stopTimer = () => {
		timerCounted = 0
		timerRunningSince = null
		renderTimerButtons()
		renderTimer()
	}

	// ---- テーマ ----

	const renderTheme = () => {
		button('theme')?.setAttribute('aria-pressed', String(getColorScheme() === 'dark only'))
	}
	onStoredColorSchemeChange(renderTheme)

	// ---- 表示の切り替え ----

	const renderView = () => {
		const shown = shownView()
		if (shown === 'scroll') delete deck.dataset.view
		else deck.dataset.view = shown
		if (controls) controls.hidden = shown === 'scroll'
		if (timer) timer.hidden = shown !== 'presenter'
		// 発表者ビューから、さらに発表者ビューを開いたり、ノートを隠したりする意味はないので、ボタンを出さない
		for (const action of ['notes', 'presenter'] as const) {
			const element = button(action)
			if (element) element.hidden = shown === 'presenter'
		}
		renderSlides()
		renderProgress()
		renderNotes()
		renderTheme()
	}

	const setView = (next: View) => {
		const previous = view
		view = next
		renderView()
		if (view !== 'scroll') {
			writeHash()
			wake()
		} else if (previous !== 'scroll') {
			// 縦に並べる形に戻ったとき、発表の表示で見ていたスライドから読めるようにする
			scrollToCurrent()
		}
	}

	// ---- 印刷 ----

	const setPrinting = (next: boolean) => {
		if (printing === next) return
		printing = next
		renderView()
	}

	// beforeprint と afterprint に加え、印刷のメディアへの切り替えも受ける。どちらか一方しか起きない場合にも
	// 印刷の形にするためで、両方が起きても setPrinting は同じ状態に落ち着く
	window.addEventListener('beforeprint', () => {
		setPrinting(true)
	})
	window.addEventListener('afterprint', () => {
		setPrinting(false)
	})
	matchMedia('print').addEventListener('change', (event) => {
		setPrinting(event.matches)
	})

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
			case 'timer-play':
				playTimer()
				break
			case 'timer-pause':
				pauseTimer()
				break
			case 'timer-stop':
				stopTimer()
				break
		}
	}

	const ACTIONS: readonly Action[] = [
		'prev',
		'next',
		'notes',
		'fullscreen',
		'presenter',
		'theme',
		'timer-play',
		'timer-pause',
		'timer-stop',
	]
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
		// フォーカスしたノートの中では、ページ単位と端までのスクロールのキーを、長いノートのスクロールに残す。
		// 左右の矢印はノートの横のスクロールに使わないので、スライドの移動のままにする
		if (isInNotes(event.target) && NOTES_SCROLL_KEYS.has(event.key)) return

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
		// ノートの領域はデッキの中にあるが、ノートをスクロールしたり読んだりするクリックで、スライドを移さない
		if (event.target instanceof Element && event.target.closest('.slide > ._notes')) return
		// 文字を選んだ操作は、移動に数えない
		if (getSelection()?.isCollapsed === false) return
		const isLeftThird = event.clientX < document.documentElement.clientWidth / 3
		goTo(isLeftThird ? index - 1 : index + 1)
	})

	// ---- 始める ----

	if (isPresenter) {
		// 表示は経過時間から毎回計算するので、間隔がずれても表示の誤差は積もらない
		setInterval(renderTimer, 1000)
		stopTimer()
		setView('presenter')
	} else {
		setView(landscape.matches ? 'present' : 'scroll')
		// 縦に並べる形で #3 のように開いたときは、そのスライドから読めるようにする
		if (view === 'scroll' && location.hash !== '') scrollToCurrent()
		landscape.addEventListener('change', (event) => {
			setView(event.matches ? 'present' : 'scroll')
		})
	}
}
