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
// ConfigManager (repo + token)
// ─────────────────────────────────────────────
const ConfigManager = {
  repoKey: 'ocr_repo',
  tokenKey: 'ocr_token',

  getRepo() { return localStorage.getItem(this.repoKey) || ''; },
  getToken() { return localStorage.getItem(this.tokenKey) || ''; },
  setRepo(v) { localStorage.setItem(this.repoKey, v.trim()); },
  setToken(v) { localStorage.setItem(this.tokenKey, v.trim()); }
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
// GitHubAPIClient
// ─────────────────────────────────────────────
const GitHubAPIClient = {
  baseURL: 'https://api.github.com',

  headers(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  },

  // Get existing file SHA (needed to update a file)
  async getFileSHA(repo, path, token) {
    const res = await fetch(`${this.baseURL}/repos/${repo}/contents/${path}`, {
      headers: this.headers(token)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to check file: ${res.status}`);
    const data = await res.json();
    return data.sha || null;
  },

  // Push a file to the repo
  async pushFile(repo, path, content, message, token) {
    const sha = await this.getFileSHA(repo, path, token);

    const body = {
      message,
      content, // base64
    };
    if (sha) body.sha = sha;

    const res = await fetch(`${this.baseURL}/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.headers(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub push failed: ${res.status}`);
    }

    return await res.json();
  },

  // Fetch a file's text content
  async fetchFileContent(repo, path, token) {
    const res = await fetch(`${this.baseURL}/repos/${repo}/contents/${path}`, {
      headers: this.headers(token),
      cache: 'no-store'
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    // content is base64
    return atob(data.content.replace(/\n/g, ''));
  }
};

// ─────────────────────────────────────────────
// PollingManager
// ─────────────────────────────────────────────
const PollingManager = {
  intervalId: null,
  attempts: 0,
  maxAttempts: 40,      // 40 × 8s = ~5.3 min max wait
  intervalMs: 8000,

  start(repo, resultPath, token, onResult, onTimeout, onError) {
    this.attempts = 0;
    this.stop();

    this.intervalId = setInterval(async () => {
      this.attempts++;

      try {
        const text = await GitHubAPIClient.fetchFileContent(repo, resultPath, token);

        if (text !== null) {
          this.stop();
          onResult(text);
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
    this.restoreConfig();
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

  restoreConfig() {
    document.getElementById('repoInput').value = ConfigManager.getRepo();
    document.getElementById('tokenInput').value = ConfigManager.getToken();
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

    // ── Save config on change
    document.getElementById('repoInput').addEventListener('change', (e) => {
      ConfigManager.setRepo(e.target.value);
    });
    document.getElementById('tokenInput').addEventListener('change', (e) => {
      ConfigManager.setToken(e.target.value);
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
    const repo = document.getElementById('repoInput').value.trim();
    const token = document.getElementById('tokenInput').value.trim();

    ConfigManager.setRepo(repo);
    ConfigManager.setToken(token);

    if (!ImageUploader.file) {
      this.setStatus('Please select an image first.', 'error');
      return;
    }
    if (!repo || !token) {
      this.setStatus('GitHub repo and token are required.', 'error');
      return;
    }

    const btn = document.getElementById('processBtn');
    btn.disabled = true;

    try {
      // Build paths
      const timestamp = Date.now();
      const ext = ImageUploader.file.name.split('.').pop();
      const filename = `${username}_${timestamp}.${ext}`;
      const imagePath = `images/${filename}`;
      const resultPath = `results/${username}_${timestamp}.txt`;

      this.setStatus('Encoding image…', 'info', true);
      const base64 = await ImageUploader.toBase64();

      this.setStatus('Pushing image to GitHub…', 'info', true);
      await GitHubAPIClient.pushFile(
        repo,
        imagePath,
        base64,
        `OCR upload: ${filename}`,
        token
      );

      this.setStatus('Image uploaded. Waiting for GitHub Actions to process…', 'info', true);

      // Poll for result
      PollingManager.start(
        repo,
        resultPath,
        token,
        (text) => {
          this.setStatus('OCR complete!', 'success', false);
          this.showOutput(text);
          btn.disabled = false;
        },
        () => {
          this.setStatus('Timed out waiting for OCR result. Check Actions tab in GitHub.', 'error', false);
          btn.disabled = false;
        },
        (err) => {
          this.setStatus(`Error polling result: ${err.message}`, 'error', false);
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
