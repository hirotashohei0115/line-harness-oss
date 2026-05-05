/**
 * LINE リッチメニュー セットアップスクリプト
 *
 * 使い方:
 *   LINE_CHANNEL_ACCESS_TOKEN=<token> npx tsx scripts/setup-richmenu.ts
 */
import sharp from 'sharp';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Error: LINE_CHANNEL_ACCESS_TOKEN is not set.');
  process.exit(1);
}

const IMAGE_URL = 'https://drive.google.com/uc?export=view&id=1_DIZqhIKY1l3i9pKzLKFPhHkE3_lstBw';

const RICH_MENU = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'MacBook修理メニュー',
  chatBarText: 'メニュー',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: { type: 'message', label: '見積もり', text: '見積もりを始める' },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: { type: 'message', label: 'ご依頼の流れ', text: 'ご依頼の流れを教えて' },
    },
    {
      bounds: { x: 0, y: 843, width: 834, height: 843 },
      action: { type: 'message', label: '店舗一覧', text: '店舗の場所は？' },
    },
    {
      bounds: { x: 834, y: 843, width: 833, height: 843 },
      action: { type: 'message', label: '電話/LINE相談', text: '電話/チャットで相談する' },
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: 'message', label: 'よくある質問', text: 'よくある質問' },
    },
  ],
};

async function lineApi(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`https://api.line.me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE API ${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Google Drive redirects — follow until we get the actual image
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const raw = Buffer.from(arrayBuffer);

  // LINE rich menu image limit: 1MB. Convert to JPEG if needed.
  if (raw.length > 900_000) {
    const compressed = await sharp(raw)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    console.log(`   圧縮: ${raw.length} → ${compressed.length} bytes`);
    return { buffer: compressed, contentType: 'image/jpeg' };
  }
  return { buffer: raw, contentType: 'image/jpeg' };
}

async function uploadRichMenuImage(richMenuId: string, buffer: Buffer, contentType: string): Promise<void> {
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Image upload → ${res.status}: ${text}`);
}

async function main(): Promise<void> {
  console.log('① リッチメニューを作成中...');
  const created = await lineApi('POST', '/v2/bot/richmenu', RICH_MENU) as { richMenuId: string };
  const richMenuId = created.richMenuId;
  console.log(`   richMenuId: ${richMenuId}`);

  console.log('② 画像を取得中...');
  const { buffer, contentType } = await fetchImageBuffer(IMAGE_URL);
  console.log(`   取得完了 (${buffer.length} bytes, ${contentType})`);

  console.log('③ 画像をアップロード中...');
  await uploadRichMenuImage(richMenuId, buffer, contentType);
  console.log('   アップロード完了');

  console.log('④ デフォルトリッチメニューに設定中...');
  await lineApi('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log('   設定完了');

  console.log(`\n✅ セットアップ完了: ${richMenuId}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
