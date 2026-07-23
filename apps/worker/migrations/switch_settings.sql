CREATE TABLE IF NOT EXISTS switch_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT
);

INSERT OR IGNORE INTO switch_settings (key, value, updated_at) VALUES
  ('consult_phone_text',
   '【電話・LINE相談のご案内】' || char(10) ||
   'お問い合わせありがとうございます！' || char(10) ||
   'お急ぎの方は下記電話番号までご連絡ください' || char(10) ||
   '👉070-1391-9861' || char(10) ||
   '（受付時間：10時〜20時）' || char(10) || char(10) ||
   'LINEでのご相談をご希望の場合は' || char(10) ||
   'このままご質問・ご相談内容をご記入のうえご返信ください😆' || char(10) || char(10) ||
   '例）' || char(10) ||
   '①機種や型番：' || char(10) ||
   '　例、Nintendo Switch' || char(10) ||
   '②症状：' || char(10) ||
   '　例、液晶割れ、スティック不良' || char(10) ||
   '③ご要望：' || char(10) ||
   '　例、修理費用が知りたい',
   datetime('now'));
