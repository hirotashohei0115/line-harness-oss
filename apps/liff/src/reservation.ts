declare const liff: {
  getProfile(): Promise<{ userId: string; displayName: string }>;
};

const API_URL = 'https://macbook-repair-worker.empower-repair.workers.dev';

const STORES = [
  { key: 'gotanda', name: '五反田店', fullName: 'リペアマスター五反田店' },
  { key: 'kinshicho', name: '錦糸町店', fullName: 'リペアマスター錦糸町店' },
  { key: 'narita', name: '成田店', fullName: 'リペアマスター成田店' },
  { key: 'makuhari', name: '幕張店', fullName: 'リペアマスター幕張店' },
  { key: 'shobu', name: '菖蒲店', fullName: 'リペアマスター菖蒲店' },
  { key: 'gifu', name: '岐阜店', fullName: 'リペアマスター岐阜店' },
  { key: 'utsunomiya', name: '宇都宮店', fullName: 'リペアマスターベルモール宇都宮店' },
  { key: 'aomori', name: '青森店', fullName: 'リペアマスター青森店' },
  { key: 'morioka', name: '盛岡店', fullName: 'リペアマスター盛岡店' },
  { key: 'oita', name: '大分店', fullName: 'リペアマスター大分店' },
  { key: 'kizugawa', name: '木津川店', fullName: 'リペアマスター木津川店' },
  { key: 'nagaoka', name: '長岡店', fullName: 'リペアマスター長岡リバーサイド千秋店' },
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
    if (!res.ok) {
      console.error('[reservation] fetchSlots non-ok:', res.status, url);
      return [];
    }
    const json = await res.json() as { success: boolean; data?: { slots: string[] } | null };
    const slots = json.data?.slots;
    if (!Array.isArray(slots)) {
      console.error('[reservation] fetchSlots unexpected response:', JSON.stringify(json), url);
      return [];
    }
    return slots;
  } catch (err) {
    console.error('[reservation] fetchSlots error:', err, url);
    return [];
  }
}

function renderStep1() {
  const container = getContainer();
  container.innerHTML = `
    <div class="res-wrap">
      <div class="res-header">
        <div class="res-step-indicator">
          <span class="step active">1</span>
          <span class="step-line"></span>
          <span class="step">2</span>
          <span class="step-line"></span>
          <span class="step">3</span>
          <span class="step-line"></span>
          <span class="step">4</span>
        </div>
        <h2 class="res-title">店舗を選択</h2>
      </div>
      <div class="res-body">
        <div class="store-list">
          ${STORES.map(s => `
            <button class="store-btn${state.storeKey === s.key ? ' selected' : ''}" data-key="${s.key}">
              <span class="store-name">${escapeHtml(s.name)}</span>
              <span class="store-full">${escapeHtml(s.fullName)}</span>
            </button>
          `).join('')}
        </div>
        ${state.error ? `<p class="res-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="res-footer">
        <button class="btn-primary" id="step1Next" ${!state.storeKey ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.store-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.storeKey = (btn as HTMLElement).dataset['key'] ?? '';
      renderStep1();
    });
  });

  $('step1Next')?.addEventListener('click', () => {
    if (!state.storeKey) return;
    state.error = '';
    state.step = 2;
    renderStep2();
  });
}

function getDates(): { dateStr: string; label: string; dayIdx: number }[] {
  const dates = [];
  // Use JST-based "today" by calculating from UTC + 9h offset
  const nowMs = Date.now() + 9 * 60 * 60 * 1000;
  const jstToday = new Date(nowMs);
  const baseYear = jstToday.getUTCFullYear();
  const baseMonth = jstToday.getUTCMonth();
  const baseDay = jstToday.getUTCDate();

  for (let i = 1; i <= 30; i++) {
    // Always construct from UTC noon to avoid DST edge cases
    const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + i, 3, 0, 0));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push({
      dateStr: `${y}-${m}-${day}`,
      label: `${Number(m)}/${Number(day)}（${DAY_LABELS[d.getUTCDay()]}）`,
      dayIdx: d.getUTCDay(),
    });
  }
  return dates;
}

async function renderStep2() {
  const container = getContainer();
  const storeName = STORES.find(s => s.key === state.storeKey)?.name ?? '';
  container.innerHTML = `
    <div class="res-wrap">
      <div class="res-header">
        <div class="res-step-indicator">
          <span class="step done">1</span>
          <span class="step-line active-line"></span>
          <span class="step active">2</span>
          <span class="step-line"></span>
          <span class="step">3</span>
          <span class="step-line"></span>
          <span class="step">4</span>
        </div>
        <h2 class="res-title">日付を選択</h2>
        <p class="res-subtitle">${escapeHtml(storeName)}</p>
      </div>
      <div class="res-body">
        <div class="date-grid" id="dateGrid">読み込み中...</div>
        ${state.error ? `<p class="res-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="res-footer">
        <button class="btn-secondary" id="step2Back">戻る</button>
        <button class="btn-primary" id="step2Next" ${!state.date ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  $('step2Back')?.addEventListener('click', () => { state.step = 1; renderStep1(); });
  $('step2Next')?.addEventListener('click', () => {
    if (!state.date) return;
    state.step = 3;
    renderStep3();
  });

  // Build date list before the async fetch so DOM is responsive
  const dates = getDates();

  // Load store hours to check closed days
  let closedDays = new Set<number>();
  try {
    const res = await fetch(`${API_URL}/api/store-hours/${encodeURIComponent(state.storeKey)}`);
    if (res.ok) {
      const data = await res.json() as { success: boolean; data: { day_of_week: number; is_closed: number }[] | null };
      const hours = data?.data ?? [];
      closedDays = new Set(hours.filter(h => h.is_closed).map(h => h.day_of_week));
    }
  } catch (err) {
    console.error('[reservation] store-hours fetch failed:', err);
    // Non-fatal: continue with no closed days rather than blocking the user
  }

  const dateGrid = $('dateGrid');
  if (!dateGrid) return;

  dateGrid.innerHTML = dates.map(d => {
    const isClosed = closedDays.has(d.dayIdx);
    const isSelected = state.date === d.dateStr;
    return `<button class="date-btn${isSelected ? ' selected' : ''}${isClosed ? ' closed' : ''}" data-date="${d.dateStr}" ${isClosed ? 'disabled' : ''}>${d.label}</button>`;
  }).join('');

  dateGrid.querySelectorAll('.date-btn:not(.closed)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.date = (btn as HTMLElement).dataset['date'] ?? '';
      dateGrid.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const nextBtn = $('step2Next') as HTMLButtonElement | null;
      if (nextBtn) nextBtn.disabled = false;
    });
  });
}

async function renderStep3() {
  const container = getContainer();
  const storeName = STORES.find(s => s.key === state.storeKey)?.name ?? '';
  container.innerHTML = `
    <div class="res-wrap">
      <div class="res-header">
        <div class="res-step-indicator">
          <span class="step done">1</span>
          <span class="step-line active-line"></span>
          <span class="step done">2</span>
          <span class="step-line active-line"></span>
          <span class="step active">3</span>
          <span class="step-line"></span>
          <span class="step">4</span>
        </div>
        <h2 class="res-title">時間を選択</h2>
        <p class="res-subtitle">${escapeHtml(storeName)} / ${formatDateDisplay(state.date)}</p>
      </div>
      <div class="res-body">
        <div class="time-grid" id="timeGrid">読み込み中...</div>
        ${state.error ? `<p class="res-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="res-footer">
        <button class="btn-secondary" id="step3Back">戻る</button>
        <button class="btn-primary" id="step3Next" ${!state.time ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `;

  $('step3Back')?.addEventListener('click', () => { state.step = 2; state.time = ''; renderStep2(); });
  $('step3Next')?.addEventListener('click', () => {
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

  const timeGrid = $('timeGrid');
  if (!timeGrid) return;

  if (fetchFailed) {
    timeGrid.innerHTML = '<p class="no-slots">時間帯の読み込みに失敗しました。<br>戻って再度お試しください。</p>';
    return;
  }

  if (slots.length === 0) {
    timeGrid.innerHTML = '<p class="no-slots">この日は予約可能な時間帯がありません。<br>別の日付をお選びください。</p>';
    return;
  }

  timeGrid.innerHTML = slots.map(slot => {
    const isSelected = state.time === slot;
    return `<button class="time-btn${isSelected ? ' selected' : ''}" data-time="${slot}">${slot}</button>`;
  }).join('');

  timeGrid.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.time = (btn as HTMLElement).dataset['time'] ?? '';
      timeGrid.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const nextBtn = $('step3Next') as HTMLButtonElement | null;
      if (nextBtn) nextBtn.disabled = false;
    });
  });
}

function renderStep4() {
  const container = getContainer();
  const store = STORES.find(s => s.key === state.storeKey);
  container.innerHTML = `
    <div class="res-wrap">
      <div class="res-header">
        <div class="res-step-indicator">
          <span class="step done">1</span>
          <span class="step-line active-line"></span>
          <span class="step done">2</span>
          <span class="step-line active-line"></span>
          <span class="step done">3</span>
          <span class="step-line active-line"></span>
          <span class="step active">4</span>
        </div>
        <h2 class="res-title">お客様情報</h2>
        <p class="res-subtitle">${escapeHtml(store?.name ?? '')} / ${formatDateDisplay(state.date)} ${escapeHtml(state.time)}〜</p>
      </div>
      <div class="res-body">
        <div class="form-group">
          <label class="form-label">お名前 <span class="required">*</span></label>
          <input id="inputName" class="form-input" type="text" placeholder="山田太郎" value="${escapeHtml(state.name)}" />
        </div>
        <div class="form-group">
          <label class="form-label">電話番号 <span class="required">*</span></label>
          <input id="inputPhone" class="form-input" type="tel" placeholder="090-1234-5678" value="${escapeHtml(state.phone)}" />
        </div>
        <div class="form-group">
          <label class="form-label">ご要望・症状（任意）</label>
          <textarea id="inputNotes" class="form-textarea" placeholder="例：MacBook Air 2022 液晶割れ">${escapeHtml(state.notes)}</textarea>
        </div>
        ${state.error ? `<p class="res-error">${escapeHtml(state.error)}</p>` : ''}
      </div>
      <div class="res-footer">
        <button class="btn-secondary" id="step4Back">戻る</button>
        <button class="btn-primary" id="step4Submit" ${state.submitting ? 'disabled' : ''}>
          ${state.submitting ? '送信中...' : '予約を確定する'}
        </button>
      </div>
    </div>
  `;

  $('step4Back')?.addEventListener('click', () => { state.step = 3; renderStep3(); });

  $('step4Submit')?.addEventListener('click', async () => {
    const nameEl = $('inputName') as HTMLInputElement | null;
    const phoneEl = $('inputPhone') as HTMLInputElement | null;
    const notesEl = $('inputNotes') as HTMLTextAreaElement | null;
    state.name = nameEl?.value.trim() ?? '';
    state.phone = phoneEl?.value.trim() ?? '';
    state.notes = notesEl?.value.trim() ?? '';

    if (!state.name) {
      state.error = 'お名前は必須です';
      renderStep4();
      return;
    }

    if (!state.phone) {
      state.error = '電話番号を入力してください';
      renderStep4();
      return;
    }

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
    <div class="res-wrap res-center">
      <div class="res-check">✓</div>
      <h2 class="res-title">予約が完了しました！</h2>
      <div class="res-confirm-box">
        <div class="confirm-row"><span class="confirm-label">店舗</span><span>${escapeHtml(store?.fullName ?? '')}</span></div>
        <div class="confirm-row"><span class="confirm-label">日時</span><span>${formatDateDisplay(state.date)} ${escapeHtml(state.time)}〜</span></div>
        <div class="confirm-row"><span class="confirm-label">お名前</span><span>${escapeHtml(state.name)} 様</span></div>
        ${state.phone ? `<div class="confirm-row"><span class="confirm-label">電話番号</span><span>${escapeHtml(state.phone)}</span></div>` : ''}
      </div>
      <p class="res-note">LINEに確認メッセージをお送りしました。<br>ご来店をお待ちしております！</p>
    </div>
  `;
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    body { margin: 0; font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; color: #1a1a1a; }
    .res-wrap { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: #fff; }
    .res-header { padding: 20px 16px 16px; background: #fff; border-bottom: 1px solid #eee; }
    .res-body { flex: 1; padding: 16px; overflow-y: auto; }
    .res-footer { padding: 16px; display: flex; gap: 10px; border-top: 1px solid #eee; background: #fff; }
    .res-title { margin: 8px 0 4px; font-size: 18px; font-weight: 700; }
    .res-subtitle { margin: 0; font-size: 13px; color: #666; }
    .res-error { color: #e53e3e; font-size: 13px; margin-top: 8px; }
    .res-center { align-items: center; justify-content: center; text-align: center; padding: 32px 16px; }
    .res-check { width: 64px; height: 64px; background: #06C755; border-radius: 50%; color: #fff; font-size: 28px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .res-note { font-size: 13px; color: #666; line-height: 1.6; margin-top: 16px; }
    .res-confirm-box { background: #f9f9f9; border-radius: 8px; padding: 16px; width: 100%; box-sizing: border-box; margin-top: 12px; }
    .confirm-row { display: flex; gap: 12px; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #eee; }
    .confirm-row:last-child { border-bottom: none; }
    .confirm-label { color: #888; min-width: 56px; }
    .res-step-indicator { display: flex; align-items: center; margin-bottom: 12px; }
    .step { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #bbb; background: #fff; }
    .step.active { border-color: #06C755; color: #06C755; }
    .step.done { border-color: #06C755; background: #06C755; color: #fff; }
    .step-line { flex: 1; height: 2px; background: #ddd; }
    .active-line { background: #06C755; }
    .store-list { display: flex; flex-direction: column; gap: 8px; }
    .store-btn { background: #fff; border: 2px solid #eee; border-radius: 10px; padding: 12px 14px; text-align: left; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 2px; }
    .store-btn.selected { border-color: #06C755; background: #f0fff4; }
    .store-btn:active { background: #f5f5f5; }
    .store-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
    .store-full { font-size: 12px; color: #888; }
    .date-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .date-btn { border: 2px solid #eee; border-radius: 8px; padding: 10px 4px; font-size: 13px; background: #fff; cursor: pointer; transition: all 0.15s; }
    .date-btn.selected { border-color: #06C755; background: #f0fff4; color: #06C755; font-weight: 700; }
    .date-btn.closed { background: #f5f5f5; color: #ccc; cursor: not-allowed; }
    .time-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .time-btn { border: 2px solid #eee; border-radius: 8px; padding: 12px 4px; font-size: 14px; font-weight: 600; background: #fff; cursor: pointer; transition: all 0.15s; }
    .time-btn.selected { border-color: #06C755; background: #f0fff4; color: #06C755; }
    .no-slots { text-align: center; color: #888; font-size: 14px; line-height: 1.6; padding: 24px 0; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #444; }
    .required { color: #e53e3e; }
    .form-input, .form-textarea { width: 100%; box-sizing: border-box; border: 1.5px solid #ddd; border-radius: 8px; padding: 10px 12px; font-size: 15px; outline: none; transition: border-color 0.15s; font-family: inherit; }
    .form-input:focus, .form-textarea:focus { border-color: #06C755; }
    .form-textarea { min-height: 80px; resize: vertical; }
    .btn-primary { flex: 1; padding: 14px; border: none; border-radius: 10px; background: #06C755; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary:not(:disabled):active { opacity: 0.85; }
    .btn-secondary { padding: 14px 20px; border: 1.5px solid #ddd; border-radius: 10px; background: #fff; color: #666; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-secondary:active { background: #f5f5f5; }
  `;
  document.head.appendChild(style);
}

export async function initReservation(): Promise<void> {
  injectStyles();

  let profile: { userId: string; displayName: string };
  try {
    profile = await liff.getProfile();
    state.lineUserId = profile.userId;
    state.name = profile.displayName;
  } catch {
    getContainer().innerHTML = '<div style="padding:32px;text-align:center;color:#e53e3e;">プロフィールの取得に失敗しました</div>';
    return;
  }

  // Check for pre-selected store from URL param
  const params = new URLSearchParams(window.location.search);
  const storeFromUrl = params.get('storeKey') ?? params.get('store'); // support both for backward compat
  if (storeFromUrl && STORES.some(s => s.key === storeFromUrl)) {
    state.storeKey = storeFromUrl;
  }

  // Try to pre-fill from repair info
  const repairInfo = await fetchRepairInfo(profile.userId);
  if (repairInfo) {
    if (!state.storeKey && repairInfo.storeKey) state.storeKey = repairInfo.storeKey;
    // Build device info string for notes pre-fill
    const parts: string[] = [];
    if (repairInfo.productName) parts.push(repairInfo.productName);
    if (repairInfo.modelName && repairInfo.modelName !== 'その他・分からない') parts.push(repairInfo.modelName);
    if (repairInfo.year && repairInfo.year !== '0' && repairInfo.year !== '') parts.push(`${repairInfo.year}年式`);
    if (repairInfo.inchSize && repairInfo.inchSize !== 'その他・分からない') parts.push(repairInfo.inchSize.endsWith('インチ') ? repairInfo.inchSize : `${repairInfo.inchSize}インチ`);
    if (repairInfo.symptomName) parts.push(repairInfo.symptomName);
    if (parts.length > 0) state.notes = parts.join(' ');
  }

  renderStep1();
}
