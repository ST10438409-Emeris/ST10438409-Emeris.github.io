// ─────────────────────────────────────────────
// UsernameManager
// ─────────────────────────────────────────────
const UsernameManager = {
  key: 'ocr_username',

  get() {
    return localStorage.getItem(this.key);
  },

  set(name) {
    localStorage.setItem(this.key, name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_'));
  },

  clear() {
    localStorage.removeItem(this.key);
  }
};

// ─────────────────────────────────────────────
// ImageUploader
// ─────────────────────────────────────────────
const ImageUploader = {
  file: null,

  setFile(file) {
    this.file = file;
  },

  clear() {
    this.file = null;
  },

  async toBase64() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(this.file);
    });
  },

  showPreview(file) {
    const url = URL.createObjectURL(file);
    document.getElementById('previewImage').src = url;
    document.getElementById('previewMeta').textContent =
      `${file.name} · ${(file.size / 1024).toFixed(1)} KB · ${file.type}`;
    document.getElementById('previewSection').style.display = 'grid';
  }
};

// ─────────────────────────────────────────────
// NetlifyClient — all GitHub calls go server-side
// ─────────────────────────────────────────────
const NetlifyClient = {
  // Upload image via Netlify function
  async uploadImage(username, filename, base64, mimeType) {
    const res = await fetch('/.netlify/functions/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, filename, base64, mimeType })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
    return data; // { resultPath }
  },

  // Poll for OCR result via Netlify function
  async getResult(resultPath) {
    const res = await fetch('/.netlify/functions/get-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultPath })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Poll failed: ${res.status}`);
    return data; // { ready: bool, text: string|null }
  }
};

// ─────────────────────────────────────────────
// PollingManager
// ─────────────────────────────────────────────
const PollingManager = {
  intervalId: null,
  attempts: 0,
  maxAttempts: 40,    // 40 × 8s = ~5.3 min
  intervalMs: 8000,

  start(resultPath, onResult, onTimeout, onError) {
    this.attempts = 0;
    this.stop();

    this.intervalId = setInterval(async () => {
      this.attempts++;

      try {
        const data = await NetlifyClient.getResult(resultPath);

        if (data.ready) {
          this.stop();
          onResult(data.text);
          return;
        }
      } catch (err) {
        this.stop();
        onError(err);
        return;
      }

      if (this.attempts >= this.maxAttempts) {
        this.stop();
        onTimeout();
      }
    }, this.intervalMs);
  },

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
};

// ─────────────────────────────────────────────
// UIController
// ─────────────────────────────────────────────
const UIController = {
  init() {
    const username = UsernameManager.get();
    if (!username) {
      this.showModal();
    } else {
      this.showApp(username);
    }

    this.bindEvents();
  },

  showModal() {
    document.getElementById('usernameModal').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  },

  showApp(username) {
    document.getElementById('usernameModal').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('userBadge').textContent = `@${username}`;
  },

  setStatus(msg, type = 'info', spinning = false) {
    const el = document.getElementById('statusMessage');
    const inner = el.querySelector('.status-inner');
    const spinner = document.getElementById('spinner');
    const text = document.getElementById('statusText');

    el.style.display = 'block';
    text.textContent = msg;
    inner.className = 'status-inner' + (type !== 'info' ? ` ${type}` : '');
    spinner.className = 'loading-spinner' + (spinning ? ' active' : '');
  },

  hideStatus() {
    document.getElementById('statusMessage').style.display = 'none';
  },

  showOutput(text) {
    document.getElementById('outputText').textContent = text;
    document.getElementById('outputSection').style.display = 'block';
    document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  resetUpload() {
    ImageUploader.clear();
    document.getElementById('fileInput').value = '';
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('outputSection').style.display = 'none';
    this.hideStatus();
  },

  bindEvents() {
    // ── Save username
    document.getElementById('saveUsername').addEventListener('click', () => {
      const val = document.getElementById('usernameInput').value.trim();
      if (!val) {
        document.getElementById('usernameInput').focus();
        return;
      }
      UsernameManager.set(val);
      this.showApp(UsernameManager.get());
    });

    document.getElementById('usernameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('saveUsername').click();
    });

    // ── Change user
    document.getElementById('changeUser').addEventListener('click', () => {
      UsernameManager.clear();
      PollingManager.stop();
      this.resetUpload();
      document.getElementById('usernameInput').value = '';
      this.showModal();
    });

    // ── File input
    const fileInput = document.getElementById('fileInput');
    const uploadLabel = document.getElementById('uploadLabel');

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });

    // Drag and drop
    uploadLabel.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadLabel.classList.add('drag-over');
    });

    uploadLabel.addEventListener('dragleave', () => {
      uploadLabel.classList.remove('drag-over');
    });

    uploadLabel.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadLabel.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFile(file);
    });

    // ── Process button
    document.getElementById('processBtn').addEventListener('click', () => this.runOCR());

    // ── Clear button
    document.getElementById('clearBtn').addEventListener('click', () => this.resetUpload());

    // ── Copy button
    document.getElementById('copyBtn').addEventListener('click', () => {
      const text = document.getElementById('outputText').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = 'COPY'; }, 2000);
      });
    });
  },

  handleFile(file) {
    if (!file.type.startsWith('image/')) {
      this.setStatus('Only image files are supported.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.setStatus('File exceeds 5MB limit.', 'error');
      return;
    }

    ImageUploader.setFile(file);
    ImageUploader.showPreview(file);
    this.hideStatus();
    document.getElementById('outputSection').style.display = 'none';
  },

  async runOCR() {
    const username = UsernameManager.get();

    if (!ImageUploader.file) {
      this.setStatus('Please select an image first.', 'error');
      return;
    }

    const btn = document.getElementById('processBtn');
    btn.disabled = true;

    try {
      const timestamp = Date.now();
      const ext = ImageUploader.file.name.split('.').pop();
      const filename = `${username}_${timestamp}.${ext}`;

      this.setStatus('Encoding image…', 'info', true);
      const base64 = await ImageUploader.toBase64();

      this.setStatus('Uploading image…', 'info', true);
      const { resultPath } = await NetlifyClient.uploadImage(
        username,
        filename,
        base64,
        ImageUploader.file.type
      );

      this.setStatus('Uploaded. Waiting for OCR to process… (this takes 2–4 min)', 'info', true);

      PollingManager.start(
        resultPath,
        (text) => {
          this.setStatus('OCR complete!', 'success', false);
          this.showOutput(text);
          btn.disabled = false;
        },
        () => {
          this.setStatus('Timed out. Check the Actions tab in GitHub for errors.', 'error', false);
          btn.disabled = false;
        },
        (err) => {
          this.setStatus(`Polling error: ${err.message}`, 'error', false);
          btn.disabled = false;
        }
      );

    } catch (err) {
      this.setStatus(`Error: ${err.message}`, 'error', false);
      btn.disabled = false;
    }
  }
};

// ─────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => UIController.init());
