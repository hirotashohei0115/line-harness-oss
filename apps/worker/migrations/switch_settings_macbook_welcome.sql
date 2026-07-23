INSERT INTO switch_settings (key, value, updated_at)
VALUES (
  'macbook_welcome_text',
  'お友達登録ありがとうございます！📱

まずは電話番号をこのチャットに送っていただくだけでOKです✨
専門スタッフより直接ご連絡し、お見積りをご案内いたします📞

こちらの番号に直接お電話いただいてもかまいません👇
📞 070-1391-9786
（受付時間：10時〜20時）

※修理中もデータはそのまま！安心してご相談ください。

────────────────
💬 チャットでのご相談をご希望の場合は、そのまま下記をご記入のうえご返信ください😆

例）
①機種や型番：
　例、MacBook Air 2022 A2337
②症状：
　例、液晶割れ、画が映らない
③ご要望：
　例、修理費用が知りたい',
  datetime('now')
)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
