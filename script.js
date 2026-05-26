/* ─────────────────────────────────────────────
   VoxMark — script.js
   Web Speech API TTS with word-level highlighting
───────────────────────────────────────────── */

const textInput     = document.getElementById('text-input');
const displayBox    = document.getElementById('display-box');
const btnPlay       = document.getElementById('btn-play');
const btnPause      = document.getElementById('btn-pause');
const btnStop       = document.getElementById('btn-stop');
const rateSlider    = document.getElementById('rate-slider');
const pitchSlider   = document.getElementById('pitch-slider');
const rateVal       = document.getElementById('rate-val');
const pitchVal      = document.getElementById('pitch-val');
const voiceSelect   = document.getElementById('voice-select');
const statusText    = document.getElementById('status-text');
const progressFill  = document.getElementById('progress-fill');
const charCount     = document.getElementById('char-count');
const wordCountEl   = document.getElementById('word-count');
const fallbackBanner= document.getElementById('fallback-banner');

// ── State ──────────────────────────────────────
let words        = [];   // { text, start, end, spanIdx }
let wordSpans    = [];   // references to <span> elements
let utterance    = null;
let isSpeaking   = false;
let isPaused     = false;
let voices       = [];
let activeIdx    = -1;
let boundaryFired= false;
let resumeTimer  = null;
let fallbackTimers = [];

// ── Tokenise text into word objects ────────────
function tokenise(text) {
  const tokens = [];
  const re = /\S+|\s+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      text:   m[0],
      start:  m.index,
      end:    m.index + m[0].length,
      isWord: /\S/.test(m[0])
    });
  }
  return tokens;
}

// ── Render display box from current textarea ───
function renderDisplay(text) {
  displayBox.innerHTML = '';
  words     = tokenise(text);
  wordSpans = [];

  words.forEach(tok => {
    if (tok.isWord) {
      const span = document.createElement('span');
      span.className   = 'word';
      span.textContent = tok.text;
      tok.spanIdx = wordSpans.length;
      wordSpans.push(span);
      displayBox.appendChild(span);
    } else {
      displayBox.appendChild(document.createTextNode(tok.text));
    }
  });
}

// ── Update word count stats ────────────────────
function updateStats() {
  const text = textInput.value;
  charCount.textContent   = text.length;
  const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCountEl.textContent = wc;
}

// ── Highlight word at charIndex ────────────────
function highlightAt(charIndex) {
  const wordTokens = words.filter(w => w.isWord);
  let match = -1;

  for (let i = 0; i < wordTokens.length; i++) {
    if (wordTokens[i].start <= charIndex && charIndex < wordTokens[i].end) {
      match = i; break;
    }
  }
  // Fallback: nearest preceding word
  if (match === -1) {
    for (let i = wordTokens.length - 1; i >= 0; i--) {
      if (wordTokens[i].start <= charIndex) { match = i; break; }
    }
  }

  if (match === activeIdx) return;

  // Mark previous words as "done"
  if (activeIdx >= 0 && wordSpans[activeIdx]) {
    wordSpans[activeIdx].classList.remove('active');
    wordSpans[activeIdx].classList.add('done');
  }

  activeIdx = match;

  if (activeIdx >= 0 && wordSpans[activeIdx]) {
    wordSpans[activeIdx].classList.remove('done');
    wordSpans[activeIdx].classList.add('active');
    wordSpans[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Update progress bar
  const pct = wordTokens.length > 1 ? (activeIdx / (wordTokens.length - 1)) * 100 : 0;
  progressFill.style.width = pct.toFixed(1) + '%';
}

function clearHighlight() {
  wordSpans.forEach(s => { s.classList.remove('active', 'done'); });
  activeIdx = -1;
  progressFill.style.width = '0%';
}

// ── Load system voices ─────────────────────────
function loadVoices() {
  let all = window.speechSynthesis.getVoices();
  // Prefer English voices, fall back to all
  voices = all.filter(v => v.lang.startsWith('en'));
  if (!voices.length) voices = all;

  voiceSelect.innerHTML = '';
  if (!voices.length) {
    voiceSelect.innerHTML = '<option value="">Default voice</option>';
    return;
  }
  voices.forEach((v, i) => {
    const opt     = document.createElement('option');
    opt.value     = i;
    opt.textContent = v.name + (v.default ? ' ★' : '') + ' (' + v.lang + ')';
    voiceSelect.appendChild(opt);
  });
}

window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
loadVoices();

// ── Fallback: estimate highlight timing ───────
function runFallbackHighlight() {
  fallbackTimers.forEach(clearTimeout);
  fallbackTimers = [];
  fallbackBanner.style.display = 'block';

  const rate      = parseFloat(rateSlider.value);
  const wordTokens= words.filter(w => w.isWord);
  let   delay     = 320; // ms before first word

  wordTokens.forEach(tok => {
    const dur = Math.max(180, tok.text.length * 55 / rate);
    const t = setTimeout(() => highlightAt(tok.start), delay);
    fallbackTimers.push(t);
    delay += dur;
  });
}

// ── Chrome watchdog (re-resumes after ~15s) ───
function startWatchdog() {
  clearInterval(resumeTimer);
  resumeTimer = setInterval(() => {
    if (isSpeaking && !isPaused && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, 5000);
}

// ── Main speak ────────────────────────────────
function speak() {
  const text = textInput.value.trim();
  if (!text) return;

  window.speechSynthesis.cancel();
  clearHighlight();
  renderDisplay(textInput.value);
  boundaryFired = false;

  utterance       = new SpeechSynthesisUtterance(text);
  utterance.rate  = parseFloat(rateSlider.value);
  utterance.pitch = parseFloat(pitchSlider.value);

  const vIdx = parseInt(voiceSelect.value);
  if (!isNaN(vIdx) && voices[vIdx]) utterance.voice = voices[vIdx];

  // Word boundary events (Chrome/Edge/Safari)
  utterance.addEventListener('boundary', e => {
    if (e.name !== 'word') return;
    if (!boundaryFired) {
      boundaryFired = true;
      fallbackBanner.style.display = 'none';
    }
    highlightAt(e.charIndex);
  });

  utterance.addEventListener('start', () => {
    isSpeaking = true;
    isPaused   = false;
    setStatus('Speaking…');
    updateButtons();
    startWatchdog();

    // Give browser 500ms to fire first boundary event; if none, use fallback
    setTimeout(() => {
      if (!boundaryFired) runFallbackHighlight();
    }, 500);
  });

  utterance.addEventListener('pause',  () => { isPaused = true;  setStatus('Paused');     updateButtons(); });
  utterance.addEventListener('resume', () => { isPaused = false; setStatus('Speaking…'); updateButtons(); });
  utterance.addEventListener('end',    () => finishSpeech('Done ✓'));
  utterance.addEventListener('error',  e  => finishSpeech('Error: ' + e.error));

  window.speechSynthesis.speak(utterance);
}

function finishSpeech(msg) {
  isSpeaking = false;
  isPaused   = false;
  clearInterval(resumeTimer);
  fallbackTimers.forEach(clearTimeout);
  clearHighlight();
  progressFill.style.width = '100%';
  setTimeout(() => { progressFill.style.width = '0%'; }, 800);
  setStatus(msg);
  updateButtons();
}

// ── Button handlers ───────────────────────────
btnPlay.addEventListener('click', () => {
  if (isPaused) {
    window.speechSynthesis.resume();
  } else {
    speak();
  }
});

btnPause.addEventListener('click', () => {
  if (isSpeaking && !isPaused) window.speechSynthesis.pause();
});

btnStop.addEventListener('click', () => {
  window.speechSynthesis.cancel();
  fallbackTimers.forEach(clearTimeout);
  finishSpeech('Stopped');
});

// ── Slider readouts ───────────────────────────
rateSlider.addEventListener('input',  () => { rateVal.textContent  = parseFloat(rateSlider.value).toFixed(1) + '×'; });
pitchSlider.addEventListener('input', () => { pitchVal.textContent = parseFloat(pitchSlider.value).toFixed(1); });

// ── Live update display while not speaking ────
textInput.addEventListener('input', () => {
  updateStats();
  if (!isSpeaking) renderDisplay(textInput.value);
});

// ── UI helpers ────────────────────────────────
function setStatus(msg) { statusText.textContent = msg; }

function updateButtons() {
  const playing = isSpeaking && !isPaused;
  btnPlay.disabled  = playing;
  btnPause.disabled = !isSpeaking || isPaused;
  btnStop.disabled  = !isSpeaking;

  // Swap icon: play arrow ↔ resume arrow
  btnPlay.innerHTML = isPaused
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

// ── Init ──────────────────────────────────────
updateStats();
renderDisplay(textInput.value);
updateButtons();