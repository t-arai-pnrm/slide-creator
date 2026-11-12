import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
	// Astro 7 の既定（'jsx'）は要素間の空白を消すため、HTML と同じ空白の扱いにする（taklog と同じ）
	compressHTML: true,
})
