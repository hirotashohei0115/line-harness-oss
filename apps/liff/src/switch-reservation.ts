/**
 * Switch Reservation Calendar — Switch修理 来店予約
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=switch-reservation
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string }>;
};

const SWITCH_LIFF_ID = '2010528268-v1QutpCq';
const API_URL = import.meta.env.VITE_SWITCH_API_URL || 'https://macbook-repair-worker.empower-repair.workers.dev';

const STORES = [
  { key: 'gotanda', name: '五反田店', fullName: 'SwitchMaster五反田店' },
  { key: 'kinshicho', name: '錦糸町店', fullName: 'SwitchMaster錦糸町店' },
  { key: 'narita', name: '成田店', fullName: 'SwitchMaster成田店' },
  { key: 'makuhari', name: '幕張店', fullName: 'SwitchMaster幕張店' },
  { key: 'shobu', name: '菖蒲店', fullName: 'SwitchMaster菖蒲店' },
  { key: 'gifu', name: '岐阜店', fullName: 'SwitchMaster岐阜店' },
  { key: 'utsunomiya', name: '宇都宮店', fullName: 'SwitchMasterベルモール宇都宮店' },
  { key: 'aomori', name: '青森店', fullName: 'SwitchMaster青森店' },
  { key: 'morioka', name: '盛岡店', fullName: 'SwitchMaster盛岡店' },
  { key: 'oita', name: '大分店', fullName: 'SwitchMaster大分店' },
  { key: 'kizugawa', name: '木津川店', fullName: 'SwitchMaster木津川店' },
  { key: 'nagaoka', name: '長岡店', fullName: 'SwitchMaster長岡リバーサイド千秋店' },
];

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface State {
  step: 1 | 2 | 3 | 4;
  storeKey: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  notes: string;
  lineUserId: string;
  submitting: boolean;
  error: string;
}

const state: State = {
  step: 1,
  storeKey: '',
  date: '',
  time: '',
  name: '',
  phone: '',
  notes: '',
  lineUserId: '',
  submitting: false,
  error: '',
};

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function getContainer(): HTMLElement {
  return document.getElementById('app')!;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(dateStr + 'T00:00:00+09:00');
  const dayLabel = DAY_LABELS[dateObj.getDay()];
  return `${y}年${Number(m)}月${Number(d)}日（${dayLabel}）`;
}

interface RepairInfo {
  name: string;
  storeKey: string;
  modelName: string;
  productName: string;
  year: string;
  inchSize: string;
  symptomName: string;
}

async function fetchRepairInfo(lineUserId: string): Promise<RepairInfo | null> {
  try {
    const res = await fetch(`${API_URL}/api/repair-info/${encodeURIComponent(lineUserId)}`);
    const data = await res.json() as { success: boolean; data: RepairInfo | null };
    return data.data;
  } catch {
    return null;
  }
}

async function fetchSlots(storeKey: string, date: string): Promise<string[]> {
  const url = `${API_URL}/api/reservations/slots?storeKey=${encodeURIComponent(storeKey)}&date=${encodeURIComponent(date)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as { success: boolean; data?: { slots: string[] } | null };
    const slots = json.data?.slots;
    return Array.isArray(slots) ? slots : [];
  } catch {
    return [];
  }
}

function renderStep1() {
  const container = getContainer();
  container.innerHTML = `
    <div class="sr-wrap">
      <div class="sr-header">
        <div class="sr-step-indicator">
          <span class="sr-step sr-active">1</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">2</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">3</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">4</span>
        </div>
        <h2 class="sr-title">🎮 Switch修理 来店予約</h2>
        <p class="sr-subtitle">店舗を選択してください</p>
      </div>
      <div class="sr-body">
        <div class="sr-store-list">
          ${STORES.map(s => `
            <button class="sr-store-btn${state.storeKey === s.key ? ' sr-selected' : ''}" data-key="${s.key}">
              <span class="sr-store-name">${escapeHtml(s.name)}</span>
              <span class="sr-store-full">${escapeHtml(s.fullName)}</span>
            </button>
          `).join('')}
        </div>
        ${state.error ? `<p class="sr-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="sr-footer">
        <button class="sr-btn-primary" id="srStep1Next" ${!state.storeKey ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.sr-store-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.storeKey = (btn as HTMLElement).dataset['key'] ?? '';
      renderStep1();
    });
  });

  $('srStep1Next')?.addEventListener('click', () => {
    if (!state.storeKey) return;
    state.error = '';
    state.step = 2;
    renderStep2();
  });
}

function getDates(): { dateStr: string; label: string; dayIdx: number }[] {
  const dates = [];
  const now = new Date();
  const jstOffset = 9 * 60;
  const jstDate = new Date(now.getTime() + (jstOffset - now.getTimezoneOffset()) * 60000);
  for (let i = 0; i < 31; i++) {
    const d = new Date(jstDate);
    d.setDate(jstDate.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dayIdx = d.getDay();
    dates.push({ dateStr: `${y}-${m}-${day}`, label: `${Number(m)}/${Number(day)}（${DAY_LABELS[dayIdx]}）`, dayIdx });
  }
  return dates;
}

async function renderStep2() {
  const container = getContainer();
  const storeName = STORES.find(s => s.key === state.storeKey)?.name ?? '';
  container.innerHTML = `
    <div class="sr-wrap">
      <div class="sr-header">
        <div class="sr-step-indicator">
          <span class="sr-step sr-done">1</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-active">2</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">3</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">4</span>
        </div>
        <h2 class="sr-title">日付を選択</h2>
        <p class="sr-subtitle">${escapeHtml(storeName)}</p>
      </div>
      <div class="sr-body">
        <div class="sr-date-grid" id="srDateGrid">読み込み中...</div>
        ${state.error ? `<p class="sr-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="sr-footer">
        <button class="sr-btn-secondary" id="srStep2Back">戻る</button>
        <button class="sr-btn-primary" id="srStep2Next" ${!state.date ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  $('srStep2Back')?.addEventListener('click', () => { state.step = 1; renderStep1(); });
  $('srStep2Next')?.addEventListener('click', () => {
    if (!state.date) return;
    state.step = 3;
    renderStep3();
  });

  const dates = getDates();
  let closedDays = new Set<number>();
  try {
    const res = await fetch(`${API_URL}/api/store-hours/${encodeURIComponent(state.storeKey)}`);
    if (res.ok) {
      const data = await res.json() as { success: boolean; data: { day_of_week: number; is_closed: number }[] | null };
      const hours = data?.data ?? [];
      closedDays = new Set(hours.filter(h => h.is_closed).map(h => h.day_of_week));
    }
  } catch { /* non-fatal */ }

  const dateGrid = $('srDateGrid');
  if (!dateGrid) return;
  dateGrid.innerHTML = dates.map(d => {
    const isClosed = closedDays.has(d.dayIdx);
    const isSelected = state.date === d.dateStr;
    return `<button class="sr-date-btn${isSelected ? ' sr-selected' : ''}${isClosed ? ' sr-closed' : ''}" data-date="${d.dateStr}" ${isClosed ? 'disabled' : ''}>${d.label}</button>`;
  }).join('');

  dateGrid.querySelectorAll('.sr-date-btn:not(.sr-closed)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.date = (btn as HTMLElement).dataset['date'] ?? '';
      dateGrid.querySelectorAll('.sr-date-btn').forEach(b => b.classList.remove('sr-selected'));
      btn.classList.add('sr-selected');
      const nextBtn = $('srStep2Next') as HTMLButtonElement | null;
      if (nextBtn) nextBtn.disabled = false;
    });
  });
}

async function renderStep3() {
  const container = getContainer();
  const storeName = STORES.find(s => s.key === state.storeKey)?.name ?? '';
  container.innerHTML = `
    <div class="sr-wrap">
      <div class="sr-header">
        <div class="sr-step-indicator">
          <span class="sr-step sr-done">1</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-done">2</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-active">3</span>
          <span class="sr-step-line"></span>
          <span class="sr-step">4</span>
        </div>
        <h2 class="sr-title">時間を選択</h2>
        <p class="sr-subtitle">${escapeHtml(storeName)} / ${formatDateDisplay(state.date)}</p>
      </div>
      <div class="sr-body">
        <div class="sr-time-grid" id="srTimeGrid">読み込み中...</div>
        ${state.error ? `<p class="sr-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="sr-footer">
        <button class="sr-btn-secondary" id="srStep3Back">戻る</button>
        <button class="sr-btn-primary" id="srStep3Next" ${!state.time ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  $('srStep3Back')?.addEventListener('click', () => { state.step = 2; state.time = ''; renderStep2(); });
  $('srStep3Next')?.addEventListener('click', () => {
    if (!state.time) return;
    state.step = 4;
    renderStep4();
  });

  let slots: string[] = [];
  let fetchFailed = false;
  try {
    slots = await fetchSlots(state.storeKey, state.date);
  } catch {
    fetchFailed = true;
  }

  const timeGrid = $('srTimeGrid');
  if (!timeGrid) return;
  if (fetchFailed) {
    timeGrid.innerHTML = '<p class="sr-no-slots">時間帯の読み込みに失敗しました。<br>戻って再度お試しください。</p>';
    return;
  }
  if (slots.length === 0) {
    timeGrid.innerHTML = '<p class="sr-no-slots">この日は予約可能な時間帯がありません。<br>別の日付をお選びください。</p>';
    return;
  }

  timeGrid.innerHTML = slots.map(slot => {
    const isSelected = state.time === slot;
    return `<button class="sr-time-btn${isSelected ? ' sr-selected' : ''}" data-time="${slot}">${slot}</button>`;
  }).join('');

  timeGrid.querySelectorAll('.sr-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.time = (btn as HTMLElement).dataset['time'] ?? '';
      timeGrid.querySelectorAll('.sr-time-btn').forEach(b => b.classList.remove('sr-selected'));
      btn.classList.add('sr-selected');
      const nextBtn = $('srStep3Next') as HTMLButtonElement | null;
      if (nextBtn) nextBtn.disabled = false;
    });
  });
}

function renderStep4() {
  const container = getContainer();
  const store = STORES.find(s => s.key === state.storeKey);
  container.innerHTML = `
    <div class="sr-wrap">
      <div class="sr-header">
        <div class="sr-step-indicator">
          <span class="sr-step sr-done">1</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-done">2</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-done">3</span>
          <span class="sr-step-line sr-active-line"></span>
          <span class="sr-step sr-active">4</span>
        </div>
        <h2 class="sr-title">お客様情報</h2>
        <p class="sr-subtitle">${escapeHtml(store?.name ?? '')} / ${formatDateDisplay(state.date)} ${escapeHtml(state.time)}〜</p>
      </div>
      <div class="sr-body">
        <div class="sr-form-group">
          <label class="sr-form-label">お名前 <span class="sr-required">*</span></label>
          <input id="srInputName" class="sr-form-input" type="text" placeholder="山田太郎" value="${escapeHtml(state.name)}" />
        </div>
        <div class="sr-form-group">
          <label class="sr-form-label">電話番号 <span class="sr-required">*</span></label>
          <input id="srInputPhone" class="sr-form-input" type="tel" placeholder="090-1234-5678" value="${escapeHtml(state.phone)}" />
        </div>
        <div class="sr-form-group">
          <label class="sr-form-label">ご要望・症状（任意）</label>
          <textarea id="srInputNotes" class="sr-form-textarea" placeholder="例：Nintendo Switch OLED Joy-conドリフト">${escapeHtml(state.notes)}</textarea>
        </div>
        ${state.error ? `<p class="sr-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="sr-footer">
        <button class="sr-btn-secondary" id="srStep4Back">戻る</button>
        <button class="sr-btn-primary" id="srStep4Submit" ${state.submitting ? 'disabled' : ''}>
          ${state.submitting ? '送信中...' : '予約を確定する'}
        </button>
      </div>
    </div>
  `;

  $('srStep4Back')?.addEventListener('click', () => { state.step = 3; renderStep3(); });

  $('srStep4Submit')?.addEventListener('click', async () => {
    const nameEl = $('srInputName') as HTMLInputElement | null;
    const phoneEl = $('srInputPhone') as HTMLInputElement | null;
    const notesEl = $('srInputNotes') as HTMLTextAreaElement | null;
    state.name = nameEl?.value.trim() ?? '';
    state.phone = phoneEl?.value.trim() ?? '';
    state.notes = notesEl?.value.trim() ?? '';

    if (!state.name) { state.error = 'お名前は必須です'; renderStep4(); return; }
    if (!state.phone) { state.error = '電話番号を入力してください'; renderStep4(); return; }

    state.submitting = true;
    state.error = '';
    renderStep4();

    try {
      const res = await fetch(`${API_URL}/api/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: state.lineUserId,
          storeKey: state.storeKey,
          date: state.date,
          time: state.time,
          name: state.name,
          phone: state.phone,
          notes: state.notes,
          source: 'switch',
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? '予約に失敗しました');
      renderCompletion();
    } catch (err) {
      state.submitting = false;
      state.error = err instanceof Error ? err.message : '予約に失敗しました。もう一度お試しください。';
      renderStep4();
    }
  });
}

function renderCompletion() {
  const store = STORES.find(s => s.key === state.storeKey);
  getContainer().innerHTML = `
    <div class="sr-wrap sr-center">
      <div class="sr-check">✓</div>
      <h2 class="sr-title">予約が完了しました！</h2>
      <div class="sr-confirm-box">
        <div class="sr-confirm-row"><span class="sr-confirm-label">店舗</span><span>${escapeHtml(store?.fullName ?? '')}</span></div>
        <div class="sr-confirm-row"><span class="sr-confirm-label">日時</span><span>${formatDateDisplay(state.date)} ${escapeHtml(state.time)}〜</span></div>
        <div class="sr-confirm-row"><span class="sr-confirm-label">お名前</span><span>${escapeHtml(state.name)} 様</span></div>
        ${state.phone ? `<div class="sr-confirm-row"><span class="sr-confirm-label">電話番号</span><span>${escapeHtml(state.phone)}</span></div>` : ''}
      </div>
      <p class="sr-note">LINEに確認メッセージをお送りしました。<br>ご来店をお待ちしております！</p>
    </div>
  `;
}

function injectStyles() {
  if (document.getElementById('sr-styles')) return;
  const style = document.createElement('style');
  style.id = 'sr-styles';
  style.textContent = `
    body { margin: 0; font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; color: #1a1a1a; }
    .sr-wrap { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: #fff; }
    .sr-header { padding: 20px 16px 16px; background: #fff; border-bottom: 1px solid #eee; }
    .sr-body { flex: 1; padding: 16px; overflow-y: auto; }
    .sr-footer { padding: 16px; display: flex; gap: 10px; border-top: 1px solid #eee; background: #fff; }
    .sr-title { margin: 8px 0 4px; font-size: 18px; font-weight: 700; }
    .sr-subtitle { margin: 0; font-size: 13px; color: #666; }
    .sr-error { color: #e53e3e; font-size: 13px; margin-top: 8px; }
    .sr-center { align-items: center; justify-content: center; text-align: center; padding: 32px 16px; }
    .sr-check { width: 64px; height: 64px; background: #E83535; border-radius: 50%; color: #fff; font-size: 28px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .sr-note { font-size: 13px; color: #666; line-height: 1.6; margin-top: 16px; }
    .sr-confirm-box { background: #f9f9f9; border-radius: 8px; padding: 16px; width: 100%; box-sizing: border-box; margin-top: 12px; }
    .sr-confirm-row { display: flex; gap: 12px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #eee; }
    .sr-confirm-row:last-child { border-bottom: none; }
    .sr-confirm-label { color: #888; min-width: 56px; }
    .sr-step-indicator { display: flex; align-items: center; margin-bottom: 12px; }
    .sr-step { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #bbb; background: #fff; }
    .sr-step.sr-active { border-color: #E83535; color: #E83535; }
    .sr-step.sr-done { border-color: #E83535; background: #E83535; color: #fff; }
    .sr-step-line { flex: 1; height: 2px; background: #ddd; }
    .sr-active-line { background: #E83535; }
    .sr-store-list { display: flex; flex-direction: column; gap: 8px; }
    .sr-store-btn { background: #fff; border: 2px solid #eee; border-radius: 10px; padding: 12px 14px; text-align: left; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 2px; }
    .sr-store-btn.sr-selected { border-color: #E83535; background: #fff5f5; }
    .sr-store-btn:active { background: #f5f5f5; }
    .sr-store-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
    .sr-store-full { font-size: 12px; color: #888; }
    .sr-date-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .sr-date-btn { border: 2px solid #eee; border-radius: 8px; padding: 10px 4px; font-size: 13px; background: #fff; cursor: pointer; transition: all 0.15s; }
    .sr-date-btn.sr-selected { border-color: #E83535; background: #fff5f5; color: #E83535; font-weight: 700; }
    .sr-date-btn.sr-closed { background: #f5f5f5; color: #ccc; cursor: not-allowed; }
    .sr-time-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .sr-time-btn { border: 2px solid #eee; border-radius: 8px; padding: 12px 4px; font-size: 14px; font-weight: 600; background: #fff; cursor: pointer; transition: all 0.15s; }
    .sr-time-btn.sr-selected { border-color: #E83535; background: #fff5f5; color: #E83535; }
    .sr-no-slots { text-align: center; color: #888; font-size: 14px; line-height: 1.6; padding: 24px 0; }
    .sr-form-group { margin-bottom: 16px; }
    .sr-form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #444; }
    .sr-required { color: #E83535; }
    .sr-form-input, .sr-form-textarea { width: 100%; box-sizing: border-box; border: 1.5px solid #ddd; border-radius: 8px; padding: 10px 12px; font-size: 15px; outline: none; transition: border-color 0.15s; font-family: inherit; }
    .sr-form-input:focus, .sr-form-textarea:focus { border-color: #E83535; }
    .sr-form-textarea { min-height: 80px; resize: vertical; }
    .sr-btn-primary { flex: 1; padding: 14px; border: none; border-radius: 10px; background: #E83535; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; }
    .sr-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .sr-btn-primary:not(:disabled):active { opacity: 0.85; }
    .sr-btn-secondary { padding: 14px 20px; border: 1.5px solid #ddd; border-radius: 10px; background: #fff; color: #666; font-size: 15px; font-weight: 600; cursor: pointer; }
    .sr-btn-secondary:active { background: #f5f5f5; }
  `;
  document.head.appendChild(style);
}

export async function initSwitchReservation(): Promise<void> {
  injectStyles();

  try {
    await liff.init({ liffId: SWITCH_LIFF_ID });
  } catch {
    getContainer().innerHTML = '<div style="padding:32px;text-align:center;color:#e53e3e;">初期化に失敗しました</div>';
    return;
  }

  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return;
  }

  let profile: { userId: string; displayName: string };
  try {
    profile = await liff.getProfile();
    state.lineUserId = profile.userId;
    state.name = profile.displayName;
  } catch {
    getContainer().innerHTML = '<div style="padding:32px;text-align:center;color:#e53e3e;">プロフィールの取得に失敗しました</div>';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const storeFromUrl = params.get('storeKey') ?? params.get('store');
  if (storeFromUrl && STORES.some(s => s.key === storeFromUrl)) {
    state.storeKey = storeFromUrl;
  }

  const repairInfo = await fetchRepairInfo(profile.userId);
  if (repairInfo) {
    if (!state.storeKey && repairInfo.storeKey) state.storeKey = repairInfo.storeKey;
    const parts: string[] = [];
    if (repairInfo.productName) parts.push(repairInfo.productName);
    if (repairInfo.symptomName) parts.push(repairInfo.symptomName);
    if (parts.length > 0) state.notes = parts.join(' ');
  }

  renderStep1();
}
