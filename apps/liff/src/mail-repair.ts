/**
 * Mail Repair Form — 郵送修理ご依頼フォーム
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=mail-repair
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

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function injectStyles(): void {
  if (document.getElementById('mail-repair-styles')) return;
  const style = document.createElement('style');
  style.id = 'mail-repair-styles';
  style.textContent = `
    .mr-page { max-width: 480px; margin: 0 auto; padding: 20px 16px 40px; }
    .mr-header { text-align: center; margin-bottom: 24px; }
    .mr-header h1 { font-size: 20px; font-weight: 700; color: #333; margin-bottom: 6px; }
    .mr-header p { font-size: 13px; color: #999; }
    .mr-body { background: #fff; border-radius: 12px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .mr-field { margin-bottom: 18px; }
    .mr-label { display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 6px; }
    .mr-required { color: #e53e3e; margin-left: 2px; }
    .mr-input, .mr-select {
      width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 16px; font-family: inherit; background: #fafafa;
      transition: border-color 0.15s; box-sizing: border-box; -webkit-appearance: none;
    }
    .mr-input:focus, .mr-select:focus { outline: none; border-color: #06C755; background: #fff; }
    .mr-select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .mr-hint { font-size: 12px; color: #999; margin-top: 4px; }
    .mr-submit {
      width: 100%; padding: 15px; border: none; border-radius: 8px;
      background: #06C755; color: #fff; font-size: 16px; font-weight: 700;
      cursor: pointer; font-family: inherit; margin-top: 8px; transition: opacity 0.15s;
    }
    .mr-submit:active { opacity: 0.85; }
    .mr-submit:disabled { background: #bbb; cursor: not-allowed; }
    .mr-error { color: #e53e3e; font-size: 13px; margin: 8px 0; text-align: center; }
    .mr-success { text-align: center; padding: 48px 20px; }
    .mr-success .icon {
      width: 64px; height: 64px; border-radius: 50%; background: #06C755;
      color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 20px;
    }
    .mr-success h2 { font-size: 20px; color: #06C755; margin-bottom: 12px; font-weight: 700; }
    .mr-success p { font-size: 14px; color: #666; line-height: 1.7; }
    .mr-loading { text-align: center; padding: 60px 20px; }
    .mr-spinner {
      width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: #06C755;
      border-radius: 50%; animation: mr-spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes mr-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

function renderLoading(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="mr-page">
      <div class="mr-loading">
        <div class="mr-spinner"></div>
        <p style="color:#999;font-size:14px;">読み込み中...</p>
      </div>
    </div>
  `;
}

function renderForm(displayName: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="mr-page">
      <div class="mr-header">
        <h1>📦 郵送修理ご依頼フォーム</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <form id="mr-form" class="mr-body" novalidate>

        <div class="mr-field">
          <label class="mr-label" for="mr-name">お名前<span class="mr-required">*</span></label>
          <input class="mr-input" type="text" id="mr-name" name="name" placeholder="山田 太郎" required />
        </div>

        <div class="mr-field">
          <label class="mr-label" for="mr-postal">郵便番号<span class="mr-required">*</span></label>
          <input class="mr-input" type="text" id="mr-postal" name="postalCode" placeholder="123-4567" required />
        </div>

        <div class="mr-field">
          <label class="mr-label" for="mr-address">ご住所<span class="mr-required">*</span></label>
          <input class="mr-input" type="text" id="mr-address" name="address" placeholder="東京都渋谷区〇〇1-2-3" required />
        </div>

        <div class="mr-field">
          <label class="mr-label" for="mr-phone">電話番号<span class="mr-required">*</span></label>
          <input class="mr-input" type="tel" id="mr-phone" name="phone" placeholder="090-1234-5678" required />
        </div>

        <div class="mr-field">
          <label class="mr-label" for="mr-kit">梱包キット<span class="mr-required">*</span></label>
          <select class="mr-select" id="mr-kit" name="packagingKit" required>
            <option value="">選択してください</option>
            <option value="true">希望する（+1,000円）</option>
            <option value="false">希望しない</option>
          </select>
        </div>

        <div class="mr-field">
          <label class="mr-label" for="mr-store">配送先店舗<span class="mr-required">*</span></label>
          <select class="mr-select" id="mr-store" name="deliveryStore" required>
            <option value="">選択してください</option>
            <option value="郵送修理センター盛岡店（岩手県）">郵送修理センター盛岡店（岩手県）</option>
            <option value="郵送修理センター菖蒲店（埼玉県）">郵送修理センター菖蒲店（埼玉県）</option>
            <option value="郵送修理センター岐阜店（岐阜県）">郵送修理センター岐阜店（岐阜県）</option>
            <option value="郵送修理センター大分店（大分県）">郵送修理センター大分店（大分県）</option>
          </select>
        </div>

        <div id="mr-form-error"></div>
        <button type="submit" class="mr-submit" id="mr-submit-btn">依頼を確定する</button>
      </form>
    </div>
  `;
}

function renderSuccess(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="mr-page">
      <div class="mr-success">
        <div class="icon">✓</div>
        <h2>ご依頼を承りました！</h2>
        <p>担当者よりご連絡いたします。<br>着払いにて端末をご発送ください📦</p>
      </div>
    </div>
  `;
  // LINE アプリ内なら3秒後に自動クローズ
  if (liff.isInClient()) {
    setTimeout(() => {
      try { liff.closeWindow(); } catch { /* ignore */ }
    }, 3000);
  }
}

function renderError(msg: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="mr-page">
      <div class="mr-loading">
        <p style="color:#e53e3e;font-size:14px;">${escapeHtml(msg)}</p>
      </div>
    </div>
  `;
}

function showFormError(msg: string): void {
  const el = document.getElementById('mr-form-error');
  if (el) el.innerHTML = `<p class="mr-error">${escapeHtml(msg)}</p>`;
}

async function handleSubmit(lineUserId: string): Promise<void> {
  const btn = document.getElementById('mr-submit-btn') as HTMLButtonElement;
  const name = (document.getElementById('mr-name') as HTMLInputElement)?.value.trim();
  const postalCode = (document.getElementById('mr-postal') as HTMLInputElement)?.value.trim();
  const address = (document.getElementById('mr-address') as HTMLInputElement)?.value.trim();
  const phone = (document.getElementById('mr-phone') as HTMLInputElement)?.value.trim();
  const packagingKitRaw = (document.getElementById('mr-kit') as HTMLSelectElement)?.value;
  const deliveryStore = (document.getElementById('mr-store') as HTMLSelectElement)?.value;

  if (!name) { showFormError('お名前を入力してください'); return; }
  if (!postalCode) { showFormError('郵便番号を入力してください'); return; }
  if (!address) { showFormError('ご住所を入力してください'); return; }
  if (!phone) { showFormError('電話番号を入力してください'); return; }
  if (!packagingKitRaw) { showFormError('梱包キットを選択してください'); return; }
  if (!deliveryStore) { showFormError('配送先店舗を選択してください'); return; }

  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const res = await fetch(`${API_URL}/api/repair/mail-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineUserId,
        name,
        postalCode,
        address,
        phone,
        packagingKit: packagingKitRaw === 'true',
        deliveryStore,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `エラー（${res.status}）`);
    }

    renderSuccess();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '依頼を確定する';
    showFormError(err instanceof Error ? err.message : '送信に失敗しました');
  }
}

export async function initMailRepair(): Promise<void> {
  renderLoading();

  try {
    const profile = await liff.getProfile();
    renderForm(profile.displayName);

    const form = document.getElementById('mr-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void handleSubmit(profile.userId);
    });
  } catch (err) {
    renderError(err instanceof Error ? err.message : 'プロフィール取得エラー');
  }
}
