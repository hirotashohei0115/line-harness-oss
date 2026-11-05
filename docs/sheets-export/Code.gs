/**
 * LINE Harness → 収支表 連携用 Apps Script
 *
 * 収支表スプレッドシートの「拡張機能 > Apps Script」に貼り付けて使う。
 * LINE Harness のクロス分析画面「スプレッドシートに反映」から呼ばれ、
 * 「LINE日別_<分析名>」シートに日別の人数を書き込む。
 *
 * - A列 = 日付、2行目以降 = 1日1行
 * - 同じ日付の行は上書き、新しい日付は追加（日付順に並べ替え）
 * - 列は見出し名で管理するので、既存の列の位置は変わらない（新しい項目は右端に追加）
 *
 * 初期設定: プロジェクトの設定 > スクリプト プロパティ に
 *   SECRET = （worker の SHEETS_WEBHOOK_SECRET と同じ値）
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var written = writeDaily_(body.sheetName, body.headers, body.rows);
      return json_({ ok: true, written: written });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function writeDaily_(sheetName, headers, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  // 見出し行: 既存の列はそのまま、足りない見出しを右端に追加
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (current[0] !== '日付') { current = ['日付']; }
  current = current.filter(function (h, i) { return i === 0 || h !== ''; });
  headers.forEach(function (h) { if (current.indexOf(h) === -1) current.push(h); });
  sheet.getRange(1, 1, 1, current.length).setValues([current]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // 既存データを日付キーで読み込む
  var data = {};
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, current.length).getValues().forEach(function (r) {
      if (r[0] === '' || r[0] === null) return;
      data[dateKey_(r[0])] = r;
    });
  }

  // 受け取った行で上書き
  rows.forEach(function (r) {
    var key = r[0];
    var row = data[key] || new Array(current.length).fill('');
    while (row.length < current.length) row.push('');
    row[0] = toDate_(key);
    headers.forEach(function (h, i) { row[current.indexOf(h)] = r[i + 1]; });
    data[key] = row;
  });

  var keys = Object.keys(data).sort();
  var out = keys.map(function (k) {
    var r = data[k];
    r[0] = toDate_(k);
    while (r.length < current.length) r.push('');
    return r.slice(0, current.length);
  });
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  if (out.length) {
    sheet.getRange(2, 1, out.length, current.length).setValues(out);
    sheet.getRange(2, 1, out.length, 1).setNumberFormat('yyyy/mm/dd');
  }
  return rows.length;
}

function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).slice(0, 10).replace(/\//g, '-');
}

function toDate_(key) {
  var p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
