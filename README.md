# VoxMark — Word-by-Word TTS Highlighter

A clean, dark read-along tool powered by the **Web Speech API**. Paste any text, hit Play, and each word lights up in sync with the audio. Zero dependencies. No server needed. Works entirely in the browser.

**[Live Demo →](https://st10438409-emeris.github.io/)**

---

## Features

- Word-by-word highlight in sync with speech
- "Done" words fade to muted colour so you can track progress
- Speed (0.5×–2×) and pitch controls
- System voice picker — uses all voices installed on the device
- Progress bar
- Fallback timing for Firefox (which doesn't fire word boundary events)
- Chrome watchdog that prevents the silent 15-second pause bug
- Fully responsive for mobile

---

## Deploy to GitHub Pages (5 minutes)

### Option A — GitHub UI (easiest)

1. Create a new repository on GitHub (e.g. `voxmark`)
2. Upload these three files:
   - `index.html`
   - `style.css`
   - `script.js`
3. Go to **Settings → Pages**
4. Under *Branch*, select `main` and `/ (root)`, then click **Save**
5. Your site will be live at:  
   `https://YOUR-USERNAME.github.io/voxmark`

### Option B — Git CLI

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/voxmark.git
git push -u origin main
```

Then enable Pages in the repo settings as above.

---

## Browser Support

| Browser | Word highlighting | Notes |
|---------|:-----------------:|-------|
| Chrome / Edge | ✅ Native | Full `boundary` event support |
| Safari | ✅ Native | Works on macOS & iOS |
| Firefox | ⚠ Estimated | Uses character-timing fallback |

---

## File Structure

```
voxmark/
├── index.html   # Markup + Google Fonts import
├── style.css    # Dark editorial theme
├── script.js    # TTS engine + highlight logic
└── README.md
```

---

## How It Works

1. **Tokenise** — the text is split into `{ text, start, end }` objects preserving character offsets
2. **Render** — each word becomes a `<span class="word">` so it can be targeted independently
3. **Speak** — a `SpeechSynthesisUtterance` is created with the full text
4. **Highlight** — the `boundary` event fires before each word with `e.charIndex`; that offset maps to the token array to find and activate the right span
5. **Fallback** — if `boundary` events never fire (Firefox), timing is estimated at ~55ms per character adjusted by rate
6. **Watchdog** — Chrome silently pauses TTS after ~15s; a `setInterval` detects this and calls `.resume()`

---

## Customisation

Edit CSS variables at the top of `style.css`:

```css
:root {
  --accent:   #f5c542;   /* highlight colour */
  --hl-bg:    rgba(245,197,66,0.18);
  --bg:       #0a0b0d;   /* page background */
}
```

Change the default sample text in `index.html` inside the `<textarea>` element.

---

## License

MIT — use it however you like.
