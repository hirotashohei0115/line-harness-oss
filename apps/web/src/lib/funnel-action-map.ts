/**
 * ファネル分析アクションの発火元マッピング
 *
 * ⚠️ このマッピングは apps/worker/src/routes/webhook.ts のFlex定義と
 * 手動同期が必要です。Flexのボタンラベルを変更したり、新規Flexを追加した際は
 * 必ずこの定数も更新してください。
 *
 * 同期対象:
 * - buildInitialRepairFlex (機種選択)
 * - buildModelSelectFlex (モデル選択)
 * - buildSymptomSelectFlex (症状選択 — DB動的、repair_symptomsテーブルと同期)
 * - buildQuoteFlex (見積りFlexのフッターボタン)
 * - buildStoreSelectFlex (店舗選択)
 * - buildModelMethodFlex (モデル選択方法)
 */

export type ActionTrigger = {
  source: string
  triggerButtons: string[]
}

export const ACTION_TRIGGER_MAP: Record<string, ActionTrigger> = {
  friend_add: {
    source: 'LINE友だち追加イベント',
    triggerButtons: [],
  },
  menu_repair: {
    source: 'リッチメニュー',
    triggerButtons: ['修理依頼をする'],
  },
  product_select: {
    source: '機種選択Flex',
    triggerButtons: ['MacBook Air', 'MacBook Pro', 'その他'],
  },
  model_select: {
    source: 'モデル選択Flex',
    triggerButtons: [
      // MacBook Air
      'A2941', 'A2681', 'A2337', 'A2179', 'A1932', 'A1466', 'A1369',
      // MacBook Pro
      'A2338', 'A2141', 'A1990', 'A1989', 'A1708', 'A1707', 'A1502',
      'その他・分からない',
    ],
  },
  symptom_select: {
    // DB (repair_symptoms テーブル) から動的生成 — テーブル追加時は要更新
    source: '症状選択Flex',
    triggerButtons: [
      '画面割れ・液晶不良',
      'バッテリー劣化',
      '充電できない',
      '電源がつかない',
      'キーボード故障',
      '水没・飲み物こぼした',
      '異音がする',
      'その他故障',
    ],
  },
  delivery_method: {
    source: '見積りFlex',
    triggerButtons: ['郵送で依頼する', '店舗に持込む', '質問・相談したい'],
  },
  consult: {
    source: '見積りFlex',
    triggerButtons: ['質問・相談したい'],
  },
  order_confirm: {
    source: '見積りFlex（postback）',
    triggerButtons: ['依頼する', 'キャンセル'],
  },
  store_select: {
    // buildStoreSelectFlex — STORES配列の shortName と同期
    source: '店舗選択Flex',
    triggerButtons: [
      '五反田店', '錦糸町店', '成田店', '幕張店', '菖蒲店',
      '岐阜店', '宇都宮店', '青森店', '盛岡店', '大分店',
      '木津川店', '長岡店', '該当店舗なし',
    ],
  },
  form_submit: {
    source: '郵送修理フォーム（LIFF）',
    triggerButtons: ['依頼を確定する'],
  },
  free_message: {
    source: 'ユーザーの自由入力',
    triggerButtons: [],
  },
}
