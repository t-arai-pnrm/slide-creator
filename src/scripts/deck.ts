/**
 * デッキの発表のための操作。src/layouts/Deck.astro から一度だけ呼ぶ。
 *
 * 横長の画面で JavaScript が動くときだけ、スライドを 1 枚ずつ表示する（発表の表示）。縦長の画面と、
 * JavaScript が動かない環境では、HTML のとおり縦に並べて読む形のままにする（DESIGN.md の「枠」）。
 * 縦に並べて読む形でも、JavaScript が動くときは操作の部分を出し、前へと次へでスライドの枠まで画面を動かし、ノートを隠せるようにする。
 * キーは、ページのスクロールに使うものを除いた ← → N D だけを使う。
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
const isInNotes = (target: EventTarget | null) => target instanceof Element && target.closest('.slide > aside') !== null

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
	// 縦に並べて読む形のノートの状態は、発表の表示とは別に持つ。初期値が違い（こちらは出す）、
	// 画面の向きを変えたときに、一方で切り替えた状態がもう一方に持ち込まれないようにするため
	let scrollNotesShown = true
	/** 縦に並べて読む形で、ページの上の端にいて、前のスライドへ画面を動かせないか */
	let scrollAtStart = false
	/** 縦に並べて読む形で、ページの下の端までスクロールし、次のスライドへ画面を動かせないか */
	let scrollAtEnd = false
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
			const notes = queryHTMLElement(slide, ':scope > aside')
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
		button('prev')?.setAttribute('aria-disabled', String(index === 0 || (view === 'scroll' && scrollAtStart)))
		button('next')?.setAttribute('aria-disabled', String(index === total - 1 || (view === 'scroll' && scrollAtEnd)))
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

	// ---- 縦に並べて読む形の、今のスライド ----

	const frames = slides.map((slide) => queryHTMLElement(slide, ':scope > ._frame') ?? slide)

	/**
	 * 各スライドの枠の上端を画面の上の端に合わせるときの、スクロールの位置。
	 * ページの下の端より先へはスクロールできないので、最後のほうのスライドは、下の端の位置に寄せる
	 */
	const scrollTargets = () => {
		const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
		return frames.map((frame) => clamp(frame.getBoundingClientRect().top + window.scrollY, 0, maxScroll))
	}

	/** 小数のスクロールの位置の誤差で、同じ位置を別の位置と数えないよう、1px 未満の差は同じ位置とみなす */
	const isSameScroll = (a: number, b: number) => Math.abs(a - b) < 1

	/**
	 * 今のスライドの番号と、前と次のスライドへ画面を動かせるか。
	 * ページの下の端より先へはスクロールできないので、最後のほうのスライドは、どれも下の端の位置（同じスクロールの位置）に寄る。
	 * そのため、スクロールの位置だけでは、そのうちのどのスライドを見ているかが決まらない。
	 * 今のスライド（index）の位置に画面があれば、index のままにする。発表の表示から縦長に替えたときや、ハッシュで移ったときに、
	 * 下の端に寄せたスライドを別のスライドに書き換え、横長に戻したときに違うスライドへ戻さないため。
	 * index の位置から離れていれば、枠の上端が画面の上の端にいちばん近いスライドを今のスライドにする。近さは、そのスライドへ動かしたときの
	 * スクロールの位置で比べ、同じ近さなら後のスライドを選ぶ。いちばん下までスクロールしたときに、最後のスライドを今のスライドにするため
	 */
	const scrollPosition = () => {
		const targets = scrollTargets()
		const y = window.scrollY
		let current = 0
		const indexTarget = targets[index]
		if (indexTarget !== undefined && isSameScroll(indexTarget, y)) current = index
		else {
			targets.forEach((target, i) => {
				if (Math.abs(target - y) <= Math.abs((targets[current] ?? 0) - y)) current = i
			})
		}
		// 前へと次へは、今のスライドから数えて、今の位置から画面を動かせるスライドまで進む。下の端に寄せたスライドは、どれも今の位置と同じなので飛ばす
		const prev = targets.findLastIndex((target, i) => i < current && !isSameScroll(target, y) && target < y)
		const next = targets.findIndex((target, i) => i > current && !isSameScroll(target, y) && target > y)
		return {
			current,
			prevTarget: prev === -1 ? undefined : targets[prev],
			nextTarget: next === -1 ? undefined : targets[next],
		}
	}

	const syncScrollPosition = () => {
		// 印刷の間も縦に並べる形になるが、発表の表示に戻ったときに印刷の前のスライドへ戻せるよう、index を書き換えない
		if (view !== 'scroll' || printing) return
		const { current, prevTarget, nextTarget } = scrollPosition()
		// 横長に替えたときに、読んでいたスライドから発表の表示を始められるよう、今のスライドを index に写す
		index = current
		scrollAtStart = prevTarget === undefined
		scrollAtEnd = nextTarget === undefined
		renderProgress()
	}

	let syncFrame: number | undefined
	/** スクロールのたびに枠の位置を測らないよう、次の描画の前に 1 回だけ測る */
	const scheduleSyncScrollPosition = () => {
		if (syncFrame !== undefined) return
		syncFrame = requestAnimationFrame(() => {
			syncFrame = undefined
			syncScrollPosition()
		})
	}

	window.addEventListener('scroll', scheduleSyncScrollPosition, { passive: true })
	// ノートの切り替え、書体の読み込み、画面の幅の変化で枠の位置が変わると、スクロールしなくても今のスライドが替わりうる
	new ResizeObserver(scheduleSyncScrollPosition).observe(deck)

	/** 縦に並べて読む形で、今のスライドの前（-1）か次（1）のスライドの枠の上端まで画面を動かす */
	const scrollByStep = (step: -1 | 1) => {
		const { prevTarget, nextTarget } = scrollPosition()
		const target = step === -1 ? prevTarget : nextTarget
		if (target === undefined) return
		// 縦に並べて読む形は動かさない（DESIGN.md の「動かしてよい場面」）。CSS で scroll-behavior を足しても滑らせない
		window.scrollTo({ top: target, behavior: 'instant' })
	}

	// ---- ノート ----

	const renderNotes = () => {
		const shown = shownView()
		// 印刷の間は data-notes を外し、JavaScript が動かないときと同じ、操作の部分のない縦に並べる形の状態にする。
		// ノートは、data-notes にかかわらず、印刷では CSS で隠れる（src/components/Slide.astro）ので、紙には出ない
		if (printing) delete deck.dataset.notes
		else if (shown === 'scroll') deck.dataset.notes = scrollNotesShown ? 'shown' : 'hidden'
		// 発表者ビューは、ノートを読むための画面なので常に出す
		else deck.dataset.notes = shown === 'presenter' || notesShown ? 'shown' : 'hidden'
		// 印刷の間は view のノートの状態のままにし、印刷の前後で押した状態を変えない
		button('notes')?.setAttribute('aria-pressed', String(view === 'scroll' ? scrollNotesShown : notesShown))
	}

	const toggleNotes = () => {
		if (view !== 'scroll') {
			notesShown = !notesShown
			renderNotes()
			return
		}
		// ノートを隠すと、今のスライドより上のノートの分だけ枠が上へずれ、読んでいたスライドを見失う。
		// 今のスライドの枠を、切り替える前と同じ画面の位置に戻す
		const frame = frames[scrollPosition().current]
		const before = frame?.getBoundingClientRect().top
		scrollNotesShown = !scrollNotesShown
		renderNotes()
		if (frame && before !== undefined) {
			window.scrollBy({ top: frame.getBoundingClientRect().top - before, behavior: 'instant' })
		}
	}

	// ---- 全画面 ----

	const fullscreenButton = button('fullscreen')

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

	// 縦に並べて読む形では、前へと次へのキーを左右の矢印だけにする（keydown の処理）ので、aria-keyshortcuts も効くキーだけにする。
	// 1 枚ずつ表示する形のキーは、HTML に書いた値（src/components/DeckControls.astro）を読んで戻す
	const moveShortcuts = new Map(
		(
			[
				['prev', 'ArrowLeft'],
				['next', 'ArrowRight'],
			] as const
		).map(([action, scroll]) => [
			action,
			{ scroll, paged: button(action)?.getAttribute('aria-keyshortcuts') ?? scroll },
		]),
	)

	const renderView = () => {
		const shown = shownView()
		if (shown === 'scroll') delete deck.dataset.view
		else deck.dataset.view = shown
		// 縦に並べて読む形でも出し、印刷の間だけ隠す。JavaScript が動かないときは、HTML の hidden のまま出さない
		if (controls) controls.hidden = printing
		if (timer) timer.hidden = shown !== 'presenter'
		// 発表者ビューから、さらに発表者ビューを開いたり、ノートを隠したりする意味はないので、ボタンを出さない
		const notesButton = button('notes')
		if (notesButton) notesButton.hidden = shown === 'presenter'
		// 縦に並べて読む形（スマートフォンの縦長の画面）では、全画面と発表者ビューを使う場面がないので出さない（DESIGN.md の「操作の部分」）
		const presenterButton = button('presenter')
		if (presenterButton) presenterButton.hidden = shown === 'presenter' || shown === 'scroll'
		if (fullscreenButton) fullscreenButton.hidden = !document.fullscreenEnabled || shown === 'scroll'
		for (const [action, shortcuts] of moveShortcuts) {
			button(action)?.setAttribute('aria-keyshortcuts', shown === 'scroll' ? shortcuts.scroll : shortcuts.paged)
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
			return
		}
		// 縦に並べて読む形では操作の部分を薄くしない（DESIGN.md の「操作の部分」）。発表の表示で付けた data-idle と、
		// 待っている間のタイマーを残すと、縦長に替えた後も薄いまま残るか、2 秒後に薄くなるので、ここで外す
		clearTimeout(idleTimeout)
		controls?.removeAttribute('data-idle')
		if (previous !== 'scroll') {
			// 縦に並べる形に戻ったとき、発表の表示で見ていたスライドから読めるようにする
			scrollToCurrent()
		}
		// 初めて開いたときは、この後でハッシュのスライドまでスクロールするので、今のスライドはスクロールが済んでから測る
		scheduleSyncScrollPosition()
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
		if (view === 'scroll') return
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
				if (view === 'scroll') scrollByStep(-1)
				else goTo(index - 1)
				break
			case 'next':
				if (view === 'scroll') scrollByStep(1)
				else goTo(index + 1)
				break
			case 'notes':
				if (view !== 'presenter') toggleNotes()
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
		// Ctrl、Cmd、Alt との組み合わせは、ブラウザと OS のショートカットに残す
		if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
		if (isEditable(event.target)) return
		if (view === 'scroll') {
			// 縦に並べて読む形では、ツールチップと aria-keyshortcuts が伝えるキー（← → N D）だけを使う（DESIGN.md の「操作の部分」）。
			// スペース、Page Up / Page Down、上下の矢印、Home / End は、ページのスクロールに使うので、ブラウザに残す
			const scrollAction = (
				{
					ArrowLeft: 'prev',
					ArrowRight: 'next',
					n: 'notes',
					N: 'notes',
					d: 'theme',
					D: 'theme',
				} as const satisfies Record<string, Action>
			)[event.key]
			if (!scrollAction) return
			event.preventDefault()
			run(scrollAction)
			return
		}
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
		if (event.target instanceof Element && event.target.closest('.slide > aside')) return
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
