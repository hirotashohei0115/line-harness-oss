/**
 * Visit Repair Form — 訪問修理ご依頼フォーム
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=visit-repair
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  isInClient(): boolean;
  closeWindow(): void;
};

const API_URL = 'https://macbook-repair-worker.empower-repair.workers.dev';

interface VisitFormData {
  lineUserId: string;
  name: string;
  furigana: string;
  phone: string;
  address: string;
  customerType: 'individual' | 'corporate';
  preferredDatetime1: string;
  preferredDatetime2: string;
  preferredDatetime3: string;
  visitReason: string;
  detail: string;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function injectStyles(): void {
  if (document.getElementById('vr-styles')) return;
  const style = document.createElement('style');
  style.id = 'vr-styles';
  style.textContent = `
    .vr-page { max-width: 480px; margin: 0 auto; padding: 20px 16px 40px; }
    .vr-header { text-align: center; margin-bottom: 24px; }
    .vr-header h1 { font-size: 20px; font-weight: 700; color: #333; margin-bottom: 6px; }
    .vr-header p { font-size: 13px; color: #999; }
    .vr-body { background: #fff; border-radius: 12px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .vr-field { margin-bottom: 18px; }
    .vr-label { display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 6px; }
    .vr-required { color: #e53e3e; margin-left: 2px; }
    .vr-optional { color: #999; font-size: 12px; font-weight: 400; margin-left: 4px; }
    .vr-input, .vr-select, .vr-textarea {
      width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 16px; font-family: inherit; background: #fafafa;
      transition: border-color 0.15s; box-sizing: border-box; -webkit-appearance: none;
    }
    .vr-input:focus, .vr-select:focus, .vr-textarea:focus { outline: none; border-color: #FF6B35; background: #fff; }
    .vr-textarea { resize: vertical; min-height: 80px; }
    .vr-select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .vr-hint { font-size: 12px; color: #999; margin-top: 4px; }
    .vr-radio-group { display: flex; gap: 12px; margin-top: 4px; }
    .vr-radio-label {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      cursor: pointer; font-size: 15px; font-weight: 600; color: #555;
      transition: border-color 0.15s, background 0.15s;
    }
    .vr-radio-label input { display: none; }
    .vr-radio-label.selected { border-color: #FF6B35; background: #fff5f0; color: #FF6B35; }
    .vr-submit {
      width: 100%; padding: 15px; border: none; border-radius: 8px;
      background: #FF6B35; color: #fff; font-size: 16px; font-weight: 700;
      cursor: pointer; font-family: inherit; margin-top: 8px; transition: opacity 0.15s;
    }
    .vr-submit:active { opacity: 0.85; }
    .vr-submit:disabled { background: #bbb; cursor: not-allowed; }
    .vr-error { color: #e53e3e; font-size: 13px; margin: 8px 0; text-align: center; }
    .vr-success { text-align: center; padding: 48px 20px; }
    .vr-success .icon {
      width: 64px; height: 64px; border-radius: 50%; background: #FF6B35;
      color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 20px;
    }
    .vr-success h2 { font-size: 20px; color: #FF6B35; margin-bottom: 12px; font-weight: 700; }
    .vr-success p { font-size: 14px; color: #666; line-height: 1.7; }
    .vr-loading { text-align: center; padding: 60px 20px; }
    .vr-spinner {
      width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: #FF6B35;
      border-radius: 50%; animation: vr-spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes vr-spin { to { transform: rotate(360deg); } }
    .vr-section-title {
      font-size: 12px; font-weight: 700; color: #FF6B35; letter-spacing: 0.05em;
      text-transform: uppercase; margin: 24px 0 12px; padding-bottom: 6px;
      border-bottom: 1.5px solid #ffe0d4;
    }
  `;
  document.head.appendChild(style);
}

function renderLoading(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="vr-page">
      <div class="vr-loading">
        <div class="vr-spinner"></div>
        <p style="color:#999;font-size:14px;">読み込み中...</p>
      </div>
    </div>
  `;
}

function renderForm(displayName: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="vr-page">
      <div class="vr-header">
        <h1>🚗 訪問修理ご依頼フォーム</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <form id="vr-form" class="vr-body" novalidate>

        <p class="vr-section-title">お客様情報</p>

        <div class="vr-field">
          <label class="vr-label" for="vr-name">お名前<span class="vr-required">*</span></label>
          <input class="vr-input" type="text" id="vr-name" placeholder="山田 太郎" required />
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-furigana">フリガナ<span class="vr-required">*</span></label>
          <input class="vr-input" type="text" id="vr-furigana" placeholder="ヤマダ タロウ" required />
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-phone">電話番号<span class="vr-required">*</span></label>
          <input class="vr-input" type="tel" id="vr-phone" placeholder="090-1234-5678" required />
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-address">訪問先住所<span class="vr-required">*</span></label>
          <input class="vr-input" type="text" id="vr-address" placeholder="東京都渋谷区〇〇1-2-3" required />
        </div>

        <div class="vr-field">
          <label class="vr-label">個人 / 法人<span class="vr-required">*</span></label>
          <div class="vr-radio-group">
            <label class="vr-radio-label selected" id="vr-type-individual-label">
              <input type="radio" name="customerType" value="individual" checked id="vr-type-individual" />
              👤 個人
            </label>
            <label class="vr-radio-label" id="vr-type-corporate-label">
              <input type="radio" name="customerType" value="corporate" id="vr-type-corporate" />
              🏢 法人
            </label>
          </div>
        </div>

        <p class="vr-section-title">ご希望日時</p>

        <div class="vr-field">
          <label class="vr-label" for="vr-dt1">第1希望<span class="vr-required">*</span></label>
          <input class="vr-input" type="text" id="vr-dt1" placeholder="例：6/10（月）午前中" required />
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-dt2">第2希望<span class="vr-optional">任意</span></label>
          <input class="vr-input" type="text" id="vr-dt2" placeholder="例：6/11（火）13〜17時" />
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-dt3">第3希望<span class="vr-optional">任意</span></label>
          <input class="vr-input" type="text" id="vr-dt3" placeholder="例：6/12（水）終日" />
        </div>

        <p class="vr-section-title">ご依頼内容</p>

        <div class="vr-field">
          <label class="vr-label" for="vr-reason">訪問希望理由<span class="vr-optional">任意</span></label>
          <textarea class="vr-textarea" id="vr-reason" rows="3" placeholder="例：持ち込みが難しいため、自宅での対応を希望"></textarea>
        </div>

        <div class="vr-field">
          <label class="vr-label" for="vr-detail">依頼内容の詳細<span class="vr-optional">任意</span></label>
          <textarea class="vr-textarea" id="vr-detail" rows="4" placeholder="例：MacBook Proの液晶が割れており、画面が映らない状態です"></textarea>
        </div>

        <div id="vr-form-error"></div>
        <button type="submit" class="vr-submit" id="vr-submit-btn">依頼を確定する</button>
      </form>
    </div>
  `;

  // Radio button styling
  document.querySelectorAll('input[name="customerType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.vr-radio-label').forEach(l => l.classList.remove('selected'));
      const label = (radio as HTMLInputElement).closest('.vr-radio-label');
      if (label) label.classList.add('selected');
    });
  });
}

function renderSuccess(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="vr-page">
      <div class="vr-success">
        <div class="icon">🚗</div>
        <h2>ご依頼を承りました！</h2>
        <p>訪問可能かお調べしますので、<br>しばらくお待ちください。</p>
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
    <div class="vr-page">
      <div class="vr-loading">
        <p style="color:#e53e3e;font-size:14px;">${escapeHtml(msg)}</p>
      </div>
    </div>
  `;
}

function showFormError(msg: string): void {
  const el = document.getElementById('vr-form-error');
  if (el) el.innerHTML = `<p class="vr-error">${escapeHtml(msg)}</p>`;
}

async function handleSubmit(lineUserId: string, btn: HTMLButtonElement): Promise<void> {
  const name = (document.getElementById('vr-name') as HTMLInputElement)?.value.trim();
  const furigana = (document.getElementById('vr-furigana') as HTMLInputElement)?.value.trim();
  const phone = (document.getElementById('vr-phone') as HTMLInputElement)?.value.trim();
  const address = (document.getElementById('vr-address') as HTMLInputElement)?.value.trim();
  const customerTypeEl = document.querySelector('input[name="customerType"]:checked') as HTMLInputElement;
  const customerType = (customerTypeEl?.value ?? 'individual') as 'individual' | 'corporate';
  const preferredDatetime1 = (document.getElementById('vr-dt1') as HTMLInputElement)?.value.trim();
  const preferredDatetime2 = (document.getElementById('vr-dt2') as HTMLInputElement)?.value.trim();
  const preferredDatetime3 = (document.getElementById('vr-dt3') as HTMLInputElement)?.value.trim();
  const visitReason = (document.getElementById('vr-reason') as HTMLTextAreaElement)?.value.trim();
  const detail = (document.getElementById('vr-detail') as HTMLTextAreaElement)?.value.trim();

  if (!name) { showFormError('お名前を入力してください'); return; }
  if (!furigana) { showFormError('フリガナを入力してください'); return; }
  if (!phone) { showFormError('電話番号を入力してください'); return; }
  if (!address) { showFormError('訪問先住所を入力してください'); return; }
  if (!preferredDatetime1) { showFormError('第1希望日時を入力してください'); return; }

  const data: VisitFormData = {
    lineUserId,
    name,
    furigana,
    phone,
    address,
    customerType,
    preferredDatetime1,
    preferredDatetime2,
    preferredDatetime3,
    visitReason,
    detail,
  };

  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const res = await fetch(`${API_URL}/api/repair/visit-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(json.error || `エラー（${res.status}）`);
    }

    renderSuccess();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '依頼を確定する';
    showFormError(err instanceof Error ? err.message : '送信に失敗しました');
  }
}

export async function initVisitRepair(): Promise<void> {
  renderLoading();

  try {
    const profile = await liff.getProfile();
    renderForm(profile.displayName);

    const form = document.getElementById('vr-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = document.getElementById('vr-submit-btn') as HTMLButtonElement;
      void handleSubmit(profile.userId, btn);
    });
  } catch (err) {
    renderError(err instanceof Error ? err.message : 'プロフィール取得エラー');
  }
}
