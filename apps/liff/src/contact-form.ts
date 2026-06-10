/**
 * Contact Form — お問い合わせフォーム
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=contact-form&api={API_URL}
 *
 * Collects: name, phone, model (with method selector), symptom
 * On submit: sends to POST /api/contact-form → worker sends LINE push reply
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  isInClient(): boolean;
  closeWindow(): void;
};

const PRODUCTION_API_URL = 'https://macbook-repair-worker.empower-repair.workers.dev';
const STAGING_API_URL = 'https://macbook-repair-worker-staging.nakamura-yao.workers.dev';
const STAGING_LIFF_ID = '2010356368-saZxu3fZ';

function getApiUrl(): string {
  const liffId = detectLiffId();
  if (liffId === STAGING_LIFF_ID) return STAGING_API_URL;
  return PRODUCTION_API_URL;
}

function detectLiffId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('liffId') || STAGING_LIFF_ID;
}

const LIFF_ID = detectLiffId();

const AIR_MODELS = ['A2941', 'A2681', 'A2337', 'A2179', 'A1932', 'A1466', 'A1369'];
const PRO_MODELS = ['A2338', 'A2141', 'A1990', 'A1989', 'A1708', 'A1707', 'A1502'];
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
const INCH_SIZES = ['13インチ', '14インチ', '15インチ', '16インチ'];
const SYMPTOMS = [
  '画面割れ・液晶不良',
  'バッテリー劣化',
  '充電できない',
  '電源がつかない',
  'キーボード故障',
  '水没・飲み物こぼした',
  '異音がする',
  'その他故障',
];

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function injectStyles(): void {
  if (document.getElementById('cf-styles')) return;
  const style = document.createElement('style');
  style.id = 'cf-styles';
  style.textContent = `
    .cf-page { max-width: 480px; margin: 0 auto; padding: 20px 16px 48px; }
    .cf-header { text-align: center; margin-bottom: 24px; }
    .cf-header h1 { font-size: 20px; font-weight: 700; color: #333; margin-bottom: 6px; }
    .cf-header p { font-size: 13px; color: #999; }
    .cf-body { background: #fff; border-radius: 12px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .cf-field { margin-bottom: 18px; }
    .cf-label { display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 6px; }
    .cf-required { color: #e53e3e; margin-left: 2px; }
    .cf-input, .cf-select {
      width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 16px; font-family: inherit; background: #fafafa;
      transition: border-color 0.15s; box-sizing: border-box; -webkit-appearance: none;
    }
    .cf-input:focus, .cf-select:focus { outline: none; border-color: #00B900; background: #fff; }
    .cf-select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .cf-method-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .cf-method-btn {
      flex: 1; min-width: 80px; padding: 10px 6px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 13px; font-weight: 600; color: #555; background: #fafafa;
      cursor: pointer; text-align: center; transition: border-color 0.15s, background 0.15s;
      font-family: inherit;
    }
    .cf-method-btn.selected { border-color: #00B900; background: #f0fff4; color: #00B900; }
    .cf-sub-field { margin-top: 12px; }
    .cf-hidden { display: none !important; }
    .cf-submit {
      width: 100%; padding: 15px; border: none; border-radius: 8px;
      background: #00B900; color: #fff; font-size: 16px; font-weight: 700;
      cursor: pointer; font-family: inherit; margin-top: 8px; transition: opacity 0.15s;
    }
    .cf-submit:active { opacity: 0.85; }
    .cf-submit:disabled { background: #bbb; cursor: not-allowed; }
    .cf-error { color: #e53e3e; font-size: 13px; margin: 8px 0; text-align: center; }
    .cf-success { text-align: center; padding: 48px 20px; }
    .cf-success .icon {
      width: 64px; height: 64px; border-radius: 50%; background: #00B900;
      color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 20px;
    }
    .cf-success h2 { font-size: 20px; color: #00B900; margin-bottom: 12px; font-weight: 700; }
    .cf-success p { font-size: 14px; color: #666; line-height: 1.7; }
    .cf-loading { text-align: center; padding: 60px 20px; }
    .cf-spinner {
      width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: #00B900;
      border-radius: 50%; animation: cf-spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes cf-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

function renderLoading(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="cf-page">
      <div class="cf-loading">
        <div class="cf-spinner"></div>
        <p style="color:#999;font-size:14px;">読み込み中...</p>
      </div>
    </div>
  `;
}

function modelOptions(models: string[]): string {
  return models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
}

function renderForm(displayName: string): void {
  injectStyles();
  const yearOptions = YEARS.map((y) => `<option value="${y}年">${y}年</option>`).join('');
  const inchOptions = INCH_SIZES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const symptomOptions = SYMPTOMS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

  getApp().innerHTML = `
    <div class="cf-page">
      <div class="cf-header">
        <h1>💻 お問い合わせフォーム</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <form id="cf-form" class="cf-body" novalidate>

        <div class="cf-field">
          <label class="cf-label" for="cf-name">お名前<span class="cf-required">*</span></label>
          <input class="cf-input" type="text" id="cf-name" placeholder="山田 太郎" required />
        </div>

        <div class="cf-field">
          <label class="cf-label" for="cf-phone">電話番号<span class="cf-required">*</span></label>
          <input class="cf-input" type="tel" id="cf-phone" placeholder="090-1234-5678" required />
        </div>

        <div class="cf-field">
          <label class="cf-label" for="cf-product">機種<span class="cf-required">*</span></label>
          <select class="cf-select" id="cf-product" required>
            <option value="">選択してください</option>
            <option value="MacBook Air">MacBook Air</option>
            <option value="MacBook Pro">MacBook Pro</option>
            <option value="その他">その他</option>
          </select>

          <div id="cf-method-section" class="cf-sub-field cf-hidden">
            <label class="cf-label" style="margin-bottom:8px;">モデルの特定方法</label>
            <div class="cf-method-group">
              <button type="button" class="cf-method-btn" data-method="model">モデル名で選ぶ</button>
              <button type="button" class="cf-method-btn" data-method="year">年式で選ぶ</button>
              <button type="button" class="cf-method-btn" data-method="unknown">わからない</button>
            </div>
          </div>

          <div id="cf-model-section" class="cf-sub-field cf-hidden">
            <select class="cf-select" id="cf-model-select" style="margin-top:8px;">
              <option value="">モデル番号を選択</option>
            </select>
          </div>

          <div id="cf-year-section" class="cf-sub-field cf-hidden">
            <select class="cf-select" id="cf-year-select" style="margin-top:8px;">
              <option value="">年式を選択</option>
              ${yearOptions}
              <option value="その他の年式">その他の年式</option>
            </select>
            <div id="cf-inch-section" class="cf-sub-field cf-hidden">
              <select class="cf-select" id="cf-inch-select" style="margin-top:8px;">
                <option value="">インチ数を選択</option>
                ${inchOptions}
                <option value="その他">その他・分からない</option>
              </select>
            </div>
          </div>
        </div>

        <div class="cf-field">
          <label class="cf-label" for="cf-symptom">症状<span class="cf-required">*</span></label>
          <select class="cf-select" id="cf-symptom" required>
            <option value="">選択してください</option>
            ${symptomOptions}
          </select>
        </div>

        <div id="cf-form-error"></div>
        <button type="submit" class="cf-submit" id="cf-submit-btn">送信する</button>
      </form>
    </div>
  `;

  setupFormLogic();
}

function setupFormLogic(): void {
  const productSelect = document.getElementById('cf-product') as HTMLSelectElement;
  const methodSection = document.getElementById('cf-method-section')!;
  const modelSection = document.getElementById('cf-model-section')!;
  const yearSection = document.getElementById('cf-year-section')!;
  const inchSection = document.getElementById('cf-inch-section')!;
  const modelSelectEl = document.getElementById('cf-model-select') as HTMLSelectElement;
  const yearSelectEl = document.getElementById('cf-year-select') as HTMLSelectElement;

  let selectedMethod = '';

  productSelect.addEventListener('change', () => {
    const val = productSelect.value;
    selectedMethod = '';
    document.querySelectorAll('.cf-method-btn').forEach((b) => b.classList.remove('selected'));
    modelSection.classList.add('cf-hidden');
    yearSection.classList.add('cf-hidden');
    inchSection.classList.add('cf-hidden');

    if (val === 'MacBook Air' || val === 'MacBook Pro') {
      methodSection.classList.remove('cf-hidden');
      const models = val === 'MacBook Air' ? AIR_MODELS : PRO_MODELS;
      modelSelectEl.innerHTML = '<option value="">モデル番号を選択</option>' +
        models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('') +
        '<option value="その他・分からない">その他・分からない</option>';
    } else {
      methodSection.classList.add('cf-hidden');
    }
  });

  document.querySelectorAll('.cf-method-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMethod = (btn as HTMLElement).dataset.method || '';
      document.querySelectorAll('.cf-method-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');

      modelSection.classList.add('cf-hidden');
      yearSection.classList.add('cf-hidden');
      inchSection.classList.add('cf-hidden');

      if (selectedMethod === 'model') {
        modelSection.classList.remove('cf-hidden');
      } else if (selectedMethod === 'year') {
        yearSection.classList.remove('cf-hidden');
      }
    });
  });

  yearSelectEl.addEventListener('change', () => {
    if (yearSelectEl.value) {
      inchSection.classList.remove('cf-hidden');
    } else {
      inchSection.classList.add('cf-hidden');
    }
  });
}

function buildModelString(): string | null {
  const product = (document.getElementById('cf-product') as HTMLSelectElement)?.value;
  if (!product) return null;
  if (product === 'その他') return 'その他';

  const selectedMethodBtn = document.querySelector('.cf-method-btn.selected') as HTMLElement | null;
  const method = selectedMethodBtn?.dataset.method || '';

  if (!method) return null;

  if (method === 'unknown') return `${product}（不明）`;

  if (method === 'model') {
    const modelVal = (document.getElementById('cf-model-select') as HTMLSelectElement)?.value;
    if (!modelVal) return null;
    return `${product} ${modelVal}`;
  }

  if (method === 'year') {
    const yearVal = (document.getElementById('cf-year-select') as HTMLSelectElement)?.value;
    if (!yearVal) return null;
    const inchSection = document.getElementById('cf-inch-section');
    if (inchSection && !inchSection.classList.contains('cf-hidden')) {
      const inchVal = (document.getElementById('cf-inch-select') as HTMLSelectElement)?.value;
      if (!inchVal) return null;
      return `${product} ${yearVal} ${inchVal}`;
    }
    return `${product} ${yearVal}`;
  }

  return null;
}

function showFormError(msg: string): void {
  const el = document.getElementById('cf-form-error');
  if (el) el.innerHTML = `<p class="cf-error">${escapeHtml(msg)}</p>`;
}

function renderSuccess(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="cf-page">
      <div class="cf-success">
        <div class="icon">✓</div>
        <h2>送信完了！</h2>
        <p>内容を確認のうえ、担当者より<br>直接お電話いたします。<br>今しばらくお待ちください🙏<br><br>受付時間：10:00〜20:00</p>
      </div>
    </div>
  `;
  if (liff.isInClient()) {
    setTimeout(() => {
      try { liff.closeWindow(); } catch { /* ignore */ }
    }, 3000);
  }
}

function renderError(msg: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="cf-page">
      <div class="cf-loading">
        <p style="color:#e53e3e;font-size:14px;">${escapeHtml(msg)}</p>
      </div>
    </div>
  `;
}

async function handleSubmit(lineUserId: string, btn: HTMLButtonElement): Promise<void> {
  const name = (document.getElementById('cf-name') as HTMLInputElement)?.value.trim();
  const phone = (document.getElementById('cf-phone') as HTMLInputElement)?.value.trim();
  const symptom = (document.getElementById('cf-symptom') as HTMLSelectElement)?.value;
  const model = buildModelString();

  if (!name) { showFormError('お名前を入力してください'); return; }
  if (!phone) { showFormError('電話番号を入力してください'); return; }
  if (!model) { showFormError('機種を選択してください'); return; }
  if (!symptom) { showFormError('症状を選択してください'); return; }

  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const res = await fetch(`${getApiUrl()}/api/contact-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId, name, phone, model, symptom }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(json.error || `エラー（${res.status}）`);
    }

    renderSuccess();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '送信する';
    showFormError(err instanceof Error ? err.message : '送信に失敗しました');
  }
}

export async function initContactForm(): Promise<void> {
  renderLoading();

  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    const profile = await liff.getProfile();
    renderForm(profile.displayName);

    const form = document.getElementById('cf-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = document.getElementById('cf-submit-btn') as HTMLButtonElement;
      void handleSubmit(profile.userId, btn);
    });
  } catch (err) {
    renderError(err instanceof Error ? err.message : 'LIFF初期化エラー');
  }
}
