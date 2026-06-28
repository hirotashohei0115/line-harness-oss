/**
 * Switch Mail Repair Form — Switch修理 郵送ご依頼フォーム
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=switch-mail-repair
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  isInClient(): boolean;
  closeWindow(): void;
};

const SWITCH_LIFF_ID = '2010528268-73XYJj8u';
const API_URL = 'https://macbook-repair-worker.empower-repair.workers.dev';
const SWITCH_COLOR = '#E83535';

interface FormData {
  lineUserId: string;
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  deliveryStore: string;
  deviceType: 'switch';
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
  if (document.getElementById('smr-styles')) return;
  const style = document.createElement('style');
  style.id = 'smr-styles';
  style.textContent = `
    .smr-page { max-width: 480px; margin: 0 auto; padding: 20px 16px 40px; }
    .smr-header { text-align: center; margin-bottom: 24px; }
    .smr-header h1 { font-size: 20px; font-weight: 700; color: #333; margin-bottom: 6px; }
    .smr-header p { font-size: 13px; color: #999; }
    .smr-body { background: #fff; border-radius: 12px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .smr-field { margin-bottom: 18px; }
    .smr-label { display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 6px; }
    .smr-required { color: ${SWITCH_COLOR}; margin-left: 2px; }
    .smr-input, .smr-select {
      width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 16px; font-family: inherit; background: #fafafa;
      transition: border-color 0.15s; box-sizing: border-box; -webkit-appearance: none;
    }
    .smr-input:focus, .smr-select:focus { outline: none; border-color: ${SWITCH_COLOR}; background: #fff; }
    .smr-select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .smr-hint { font-size: 12px; color: #999; margin-top: 4px; }
    .smr-submit {
      width: 100%; padding: 15px; border: none; border-radius: 8px;
      background: ${SWITCH_COLOR}; color: #fff; font-size: 16px; font-weight: 700;
      cursor: pointer; font-family: inherit; margin-top: 8px; transition: opacity 0.15s;
    }
    .smr-submit:active { opacity: 0.85; }
    .smr-submit:disabled { background: #bbb; cursor: not-allowed; }
    .smr-back-btn {
      width: 100%; padding: 13px; border: 1.5px solid #ccc; border-radius: 8px;
      background: #fff; color: #555; font-size: 15px; font-weight: 600;
      cursor: pointer; font-family: inherit; margin-top: 10px; transition: background 0.15s;
    }
    .smr-back-btn:active { background: #f5f5f5; }
    .smr-error { color: ${SWITCH_COLOR}; font-size: 13px; margin: 8px 0; text-align: center; }
    .smr-success { text-align: center; padding: 48px 20px; }
    .smr-success .icon {
      width: 64px; height: 64px; border-radius: 50%; background: ${SWITCH_COLOR};
      color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 20px;
    }
    .smr-success h2 { font-size: 20px; color: ${SWITCH_COLOR}; margin-bottom: 12px; font-weight: 700; }
    .smr-success p { font-size: 14px; color: #666; line-height: 1.7; }
    .smr-loading { text-align: center; padding: 60px 20px; }
    .smr-spinner {
      width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: ${SWITCH_COLOR};
      border-radius: 50%; animation: smr-spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    @keyframes smr-spin { to { transform: rotate(360deg); } }
    .smr-terms-box {
      height: 320px; overflow-y: auto; border: 1.5px solid #e0e0e0; border-radius: 8px;
      padding: 14px; background: #fafafa; font-size: 12px; color: #444; line-height: 1.75;
      white-space: pre-wrap; margin-bottom: 16px;
    }
    .smr-terms-box h3 { font-size: 13px; font-weight: 700; color: #222; margin: 12px 0 4px; }
    .smr-terms-box h3:first-child { margin-top: 0; }
    .smr-checkbox-wrap {
      display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px;
      padding: 14px; background: #fff5f5; border-radius: 8px; border: 1.5px solid #fca5a5;
    }
    .smr-checkbox-wrap input[type="checkbox"] {
      width: 20px; height: 20px; flex-shrink: 0; margin-top: 2px; accent-color: ${SWITCH_COLOR}; cursor: pointer;
    }
    .smr-checkbox-wrap label { font-size: 14px; font-weight: 600; color: #7f1d1d; cursor: pointer; line-height: 1.5; }
  `;
  document.head.appendChild(style);
}

function renderLoading(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="smr-page">
      <div class="smr-loading">
        <div class="smr-spinner"></div>
        <p style="color:#999;font-size:14px;">読み込み中...</p>
      </div>
    </div>
  `;
}

function renderForm(displayName: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="smr-page">
      <div class="smr-header">
        <h1>🎮 Switch修理 郵送ご依頼フォーム</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <form id="smr-form" class="smr-body" novalidate>

        <div class="smr-field">
          <label class="smr-label" for="smr-name">お名前<span class="smr-required">*</span></label>
          <input class="smr-input" type="text" id="smr-name" name="name" placeholder="山田 太郎" required />
        </div>

        <div class="smr-field">
          <label class="smr-label" for="smr-postal">郵便番号<span class="smr-required">*</span></label>
          <input class="smr-input" type="text" id="smr-postal" name="postalCode" placeholder="123-4567" required />
        </div>

        <div class="smr-field">
          <label class="smr-label" for="smr-address">ご住所<span class="smr-required">*</span></label>
          <input class="smr-input" type="text" id="smr-address" name="address" placeholder="東京都渋谷区〇〇1-2-3" required />
        </div>

        <div class="smr-field">
          <label class="smr-label" for="smr-phone">電話番号<span class="smr-required">*</span></label>
          <input class="smr-input" type="tel" id="smr-phone" name="phone" placeholder="090-1234-5678" required />
        </div>

        <div id="smr-form-error"></div>
        <button type="submit" class="smr-submit" id="smr-submit-btn">次へ →</button>
      </form>
    </div>
  `;
}

const TERMS_TEXT = `【利用規約】
ご利用規約
1.修理サービス
①当社の修理サービスはお客様からお預かりした機器等をお客様ご指摘の症状に対して復旧・改善するよう修理又はお客様ご指定の作業を承り行う事を目的とします。又、機器本体が購入時のような正常な状態になく経年劣化等による一定ダメージを受けている場合、分解によって端末の症状が悪化したり起動しなくなる可能性が考えられます。その場合、修理作業や部品状態に瑕疵または過失がある場合を除いて、お客様又は機器等の所有者に損害が生じたとしても、当店は一切の損害賠償義務を負わないものといたします。
②当社は、機器等を確認し、当サービスの提供が可能かどうか診断いたします。当該診断については、当社で決定し、お客様は当該決定に対して異議を申し立てないものといたします。また、当サービスの提供が不可能と判断した場合は、診断費用（税込3,300円）及び返送料は、お客様の負担といたします。
③パーツの取り寄せが必要となる修理において、当社がパーツの注文後に、お客様都合によりお申し込みキャンセルとなった場合は、キャンセル料として10,000円をお支払いいただきます。
2.時間目安
・提示する修理時間は当店実績をもとにした目安であり、機器の状態によっては修理時間が想定より長くなる場合があります。
3.部品交換について
①当サービスによる部品の交換を行った場合、当該交換後の機器から取り外した部品の所有権はすべて当社に帰属するものとし、当社にて処分することにお客様は異議を申し立てません。
②当サービスによる部品はメーカー純正部品又はメーカー純正部品以外の汎用部品、リユース部品（再使用品）を使用します。
4.保証と保管期限
・修理完了後、交換した部品の不具合又は当社の作業内容の不備による不具合が発生した場合、90日以内にお客様からのお申し出があった場合に限り、無償で修理対応させていただきます。
・修理依頼品の保管期限は、修理完了連絡日より90日間とさせていただきます。
5.機器等の発送
機器等の発送については、自己責任にて梱包・発送をお願いいたします。送料は当社からの返送費用も含めてお客様負担となります。
【当社お問合せ窓口】
・電話番号：070-1271-7186
6.個人情報の取扱
・取得した個人情報につきましては、修理サービス以外には使用いたしません。

【プライバシーポリシー】
エンパワーメント株式会社では、Nintendo Switch等ゲーム機宅配修理サービスの運営に際し、お客様のプライバシーを尊重し、個人情報に対して十分な配慮を行うと共に大切に保護し、適正な管理を行う為、以下のとおりプライバシーポリシーを定めます。

1,法令等の遵守
弊社は、お客様等の個人情報の取得、利用その他一切の取り扱いについて、個人情報の保護に関する法律及びこのプライバシーポリシーを遵守します。

2,個人情報利用目的
お客様の個人情報は、原則として、当サービスに関する情報をご提供する目的や発送案内、ご注文に関するお知らせのために利用致します。

3,第三者への情報提供
お客様の個人情報は、以下の場合を除き第三者に開示・提供・譲渡することは致しません。
・当社の業務委託先（運送会社等）、業務遂行上必要な場合
・法的拘束力がある第三者機関からの開示要求がある場合
・お客様本人の同意があった場合

「お問合せ窓口」
電話番号：070-1271-7186
メールアドレス：info@SwitchMaster.jp

制定日：2025年5月23日`;

function renderTerms(data: FormData, displayName: string): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="smr-page">
      <div class="smr-header">
        <h1>📋 利用規約・プライバシーポリシー</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <div class="smr-body">
        <div class="smr-terms-box" id="smr-terms-text">${escapeHtml(TERMS_TEXT)}</div>
        <div class="smr-checkbox-wrap">
          <input type="checkbox" id="smr-agree" />
          <label for="smr-agree">利用規約およびプライバシーポリシーに同意する</label>
        </div>
        <div id="smr-terms-error"></div>
        <button class="smr-submit" id="smr-confirm-btn" disabled>依頼を確定する</button>
        <button class="smr-back-btn" id="smr-back-btn">← 戻る</button>
      </div>
    </div>
  `;

  const checkbox = document.getElementById('smr-agree') as HTMLInputElement;
  const confirmBtn = document.getElementById('smr-confirm-btn') as HTMLButtonElement;
  const backBtn = document.getElementById('smr-back-btn') as HTMLButtonElement;

  checkbox.addEventListener('change', () => {
    confirmBtn.disabled = !checkbox.checked;
  });

  confirmBtn.addEventListener('click', () => {
    void handleSubmit(data, confirmBtn);
  });

  backBtn.addEventListener('click', () => {
    renderForm(displayName);
    const form = document.getElementById('smr-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void handleNext(data.lineUserId, displayName);
    });
  });
}

function renderSuccess(): void {
  injectStyles();
  getApp().innerHTML = `
    <div class="smr-page">
      <div class="smr-success">
        <div class="icon">✓</div>
        <h2>ご依頼を承りました！</h2>
        <p>担当者よりご連絡いたします。<br>着払いにて端末をご発送ください📦</p>
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
    <div class="smr-page">
      <div class="smr-loading">
        <p style="color:${SWITCH_COLOR};font-size:14px;">${escapeHtml(msg)}</p>
      </div>
    </div>
  `;
}

function showFormError(msg: string): void {
  const el = document.getElementById('smr-form-error');
  if (el) el.innerHTML = `<p class="smr-error">${escapeHtml(msg)}</p>`;
}

function showTermsError(msg: string): void {
  const el = document.getElementById('smr-terms-error');
  if (el) el.innerHTML = `<p class="smr-error">${escapeHtml(msg)}</p>`;
}

async function handleNext(lineUserId: string, displayName: string): Promise<void> {
  const name = (document.getElementById('smr-name') as HTMLInputElement)?.value.trim();
  const postalCode = (document.getElementById('smr-postal') as HTMLInputElement)?.value.trim();
  const address = (document.getElementById('smr-address') as HTMLInputElement)?.value.trim();
  const phone = (document.getElementById('smr-phone') as HTMLInputElement)?.value.trim();

  if (!name) { showFormError('お名前を入力してください'); return; }
  if (!postalCode) { showFormError('郵便番号を入力してください'); return; }
  if (!address) { showFormError('ご住所を入力してください'); return; }
  if (!phone) { showFormError('電話番号を入力してください'); return; }

  const data: FormData = {
    lineUserId,
    name,
    postalCode,
    address,
    phone,
    deliveryStore: 'SwitchMaster青森店',
    deviceType: 'switch',
  };

  renderTerms(data, displayName);
}

async function handleSubmit(data: FormData, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const res = await fetch(`${API_URL}/api/repair/mail-orders`, {
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
    showTermsError(err instanceof Error ? err.message : '送信に失敗しました');
  }
}

export async function initSwitchMailRepair(): Promise<void> {
  renderLoading();

  try {
    await liff.init({ liffId: SWITCH_LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }
    const profile = await liff.getProfile();
    renderForm(profile.displayName);

    const form = document.getElementById('smr-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void handleNext(profile.userId, profile.displayName);
    });
  } catch (err) {
    renderError(err instanceof Error ? err.message : 'プロフィール取得エラー');
  }
}
