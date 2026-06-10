import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  getLineAccounts,
  jstNow,
  toJstString,
  getRepairSymptomsByProduct,
  getRepairPrice,
  getRepairModelPrice,
  getRepairPriceByYearInch,
  createRepairQuote,
  updateRepairQuoteRequestType,
  setFriendAttribute,
  getFriendAttribute,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import { sendChatworkMessage, jstTimestamp } from '../lib/chatwork.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Line-Signature') ?? '';
  const db = c.env.DB;

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  // Multi-account: resolve credentials from DB by destination (channel user ID)
  // or fall back to environment variables (default account)
  let channelSecret = c.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if ((body as { destination?: string }).destination) {
    const accounts = await getLineAccounts(db);
    for (const account of accounts) {
      if (!account.is_active) continue;
      const isValid = await verifySignature(account.channel_secret, rawBody, signature);
      if (isValid) {
        channelSecret = account.channel_secret;
        channelAccessToken = account.channel_access_token;
        matchedAccountId = account.id;
        break;
      }
    }
  }

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, channelAccessToken, matchedAccountId, c.env.WORKER_URL || new URL(c.req.url).origin, c.env.LIFF_URL, c.env.CHATWORK_API_TOKEN, c.env.CHATWORK_ROOM_ID);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

// ---- Repair Flow Constants ----

const MAIL_REPAIR_FORM_URL = 'https://liff.line.me/2010126656-iMP2b4Jw?page=mail-repair';
const STORE_RESERVATION_URL_GENERAL = 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation';
const PRIVACY_POLICY_URL = 'https://forms.gle/XXXXXXXXXXXXXXXX';
const CONSULT_PHONE_TEXT =
  '【電話・LINE相談のご案内】\nお問い合わせありがとうございます！\nお急ぎの方は下記電話番号までご連絡ください\n👉070-1391-9861\n（受付時間：10時〜20時）\n\nLINEでのご相談をご希望の場合は\nこのままご質問・ご相談内容をご記入のうえご返信ください😆\n\n例）\n①機種や型番：\n　例、MacBook Air 2022 A2337\n②症状：\n　例、液晶割れ、画が映らない\n③ご要望：\n　例、修理費用が知りたい';

const MISSING_MODEL_MESSAGE =
  '該当機種が存在しない可能性がございますので、お見積りを作成するためにパソコンの底面に記載されているモデル番号(Aから始まる4桁の数字)をチャットにてお知らせください！';

const CONSULTATION_REQUEST_MESSAGE =
  '下記項目について教えてください。\n＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝\n①機種や型番：\n　例、MacBook Air 2022 A2337\n②症状：\n　例、液晶割れ、画が映らない\n③ご要望：\n　例、修理費用が知りたい\n＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝\n\n上記３点について、ご回答をよろしくお願い致します。\nテクニカルスタッフが確認し、LINEにて折り返しご連絡させていただきます。\n営業時間外の場合（10:00~20:00以外）は翌営業日になる可能性がございます。\nあらかじめご了承いただけますと幸いです。';

const STORES = [
  {
    key: 'gotanda',
    shortName: '五反田店',
    name: 'リペアマスター五反田店',
    zip: '〒141-0031',
    address: '東京都品川区西五反田1丁目33-10 西五反田サインタワー9F',
    tel: '0120-025-088',
    hours: '10:00~20:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'kinshicho',
    shortName: '錦糸町店',
    name: 'リペアマスター錦糸町店',
    zip: '〒130-0013',
    address: '東京都墨田区錦糸3丁目3-3 錦糸ビル内3階',
    tel: '03-5637-8797',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'narita',
    shortName: '成田店',
    name: 'リペアマスター成田店',
    zip: '〒286-0029',
    address: '千葉県成田市ウイング土屋24 イオンモール成田店内1F',
    tel: '070-1595-6404',
    hours: '10:00~20:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'makuhari',
    shortName: '幕張店',
    name: 'リペアマスター幕張店',
    zip: '〒262-0032',
    address: '千葉県千葉市花見川区幕張町4丁目417-25 イトーヨーカドー幕張店内1F',
    tel: '070-3209-9235',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'shobu',
    shortName: '菖蒲店',
    name: 'リペアマスター菖蒲店',
    zip: '〒346-0106',
    address: '埼玉県久喜市菖蒲町菖蒲6005-1 モラージュ菖蒲内1F',
    tel: '070-1271-7186',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'gifu',
    shortName: '岐阜店',
    name: 'リペアマスター岐阜店',
    zip: '〒501-0497',
    address: '岐阜県本巣市三橋1100 モレラ岐阜2F',
    tel: '070-3131-6181',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'utsunomiya',
    shortName: '宇都宮店',
    name: 'リペアマスターベルモール宇都宮店',
    zip: '〒321-8555',
    address: '栃木県宇都宮市陽東6丁目2-1 ベルモール内2F ダイワンテレコム内',
    tel: '070-1307-5363',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'aomori',
    shortName: '青森店',
    name: 'リペアマスター青森店',
    zip: '〒030-0845',
    address: '青森県青森市緑3丁目9-2 サンロード青森内2F',
    tel: '070-3209-7849',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'morioka',
    shortName: '盛岡店',
    name: 'リペアマスター盛岡店',
    zip: '〒020-0034',
    address: '岩手県盛岡市盛岡駅前通1-44 フェザン本館内1F',
    tel: '080-3918-7346',
    hours: '10:00~19:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'oita',
    shortName: '大分店',
    name: 'リペアマスター大分店',
    zip: '〒870-1155',
    address: '大分県大分市玉沢楠本755-1 トキハわさだタウン3街区1階',
    tel: '070-1261-6924',
    hours: '10:00~18:30',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'kizugawa',
    shortName: '木津川店',
    name: 'リペアマスター木津川店',
    zip: '〒619-0216',
    address: '京都府木津川市州見台1丁目1-1-1 ガーデンモール木津川1階',
    tel: '070-6922-8143',
    hours: '10:00~20:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
  {
    key: 'nagaoka',
    shortName: '長岡店',
    name: 'リペアマスター長岡リバーサイド千秋店',
    zip: '〒940-2108',
    address: '新潟県長岡市千秋2丁目278 リバーサイド千秋2階',
    tel: '070-3229-5869',
    hours: '10:00~20:00',
    reservationUrl: 'https://liff.line.me/2010126656-iMP2b4Jw?page=reservation',
  },
] as const;

type Store = typeof STORES[number];

// ---- FAQ Data ----

type FaqSpecial = 'store_select' | 'phone' | 'reservation_button' | 'privacy_policy';
interface FaqEntry { q: string; a: string; special?: FaqSpecial }
interface FaqCategory { label: string; questions: FaqEntry[] }

const CONSULT_FAQS: Record<string, FaqCategory> = {
  mail: {
    label: '郵送修理に関する質問',
    questions: [
      { q: '郵送修理の流れは？', a: '①LINEで仮見積もり＆お申込み\nLINEで機種や状態を送るとその場で仮見積もりが可能です！仮見積もりにご納得頂けましたら、そのまま修理依頼に進めます。\n②端末を発送\n端末を梱包して発送お願い致します。送料無料ですので着払いにてお送り下さい。\n③本見積もり\n端末の状態を確認させて頂き、本見積もりを出させて頂きます。料金にご納得頂けない場合はキャンセルも可能です。\n④修理＆ご返却\n本見積もりでご了承いただけた場合は修理致します！振込、WEBクレジットにてお支払い頂いた後にご返却となります。' },
      { q: '郵送修理にかかる日数は？', a: '最短即日〜3日ほどで完了いたします。部品取り寄せが必要な場合は1週間前後かかることもございます。' },
      { q: '梱包方法は？', a: '端末本体を緩衝材（ぷちぷち）などで包んで頂き、段ボールに入れて梱包をお願い致します。梱包した際に中身が動かないように隙間を埋めて頂けると安全に発送が可能です。' },
      { q: '配送業者の指定はある？', a: '特に指定はございません。送料は弊社が負担致しますので着払いにてご発送をお願い致します。' },
      { q: '送料はかかる？', a: '送料は弊社が負担致します。ご発送頂く際は着払いで、返送の際は元払いにて発送させて頂きます。' },
      { q: 'データは消去される？', a: '基本的にはデータが消去される事はございません。データ消去が必要な際は必ずお客様にご了承を頂いてから作業を行いますのでご安心下さいませ。' },
      { q: '支払い方法は？', a: '支払い方法は銀行振込とWEBクレジット決済の2つからお選び頂けます！郵送修理の場合はクレジットでの分割払いも可能です✨修理完了のご連絡と合わせてお支払い方法のご連絡を差し上げております。' },
    ],
  },
  store: {
    label: '店頭修理に関する質問',
    questions: [
      { q: '予約は必要？', a: '基本的にはご予約がなくても修理対応は可能でございます。ただし、LINEの仮見積もり料金は指定店舗でしか使用できませんので事前にご予約が必要となります。下記ボタンより来店予約をお願い致します。', special: 'reservation_button' },
      { q: '修理にかかる日数は？', a: '最短即日〜3日ほどで完了いたします。部品取り寄せが必要な場合は1週間前後かかることもございます。' },
      { q: '当日中に受け取り可能？', a: '修理内容によって異なりますが当日中の受け取りも可能でございます。事前にパーツの取り寄せを行い、パーツ到着次第お持ち頂ければその日のうちに修理してご返却できる物もございます。詳しくはチャットにてお気軽にご質問頂ければと思います。' },
      { q: '支払い方法は？', a: '店舗によって支払い方法が異なります。お持ち込み希望の店舗に直接お問い合わせ頂けますと幸いです。' },
      { q: '店舗の場所は？', a: '', special: 'store_select' },
      { q: '代替機の貸し出しはある？', a: '基本的にはご用意しておりません。事前に修理パーツの取り寄せを行えば、即日修理も可能ですのでご希望の店舗にご相談下さい。' },
      { q: '修理後の保証はある？', a: '修理後は90日間の保証がついております。修理後に何か不具合が生じた場合は再修理可能ですのでご安心下さい。' },
    ],
  },
  device: {
    label: '修理端末に関する質問',
    questions: [
      { q: '修理できる機種は？', a: 'Macbook全般をメインで取り扱っております。年代問わず対応可能ですのでお気軽にご相談下さいませ。その他にもiMac、Macmini、Windowsパソコンも対応可能でございます。お持ちの機器でお困りの事がございましたらお気軽にご相談頂ければと思います。' },
      { q: '起動不良も修理できる？', a: 'まったく起動できない端末でも修理対応可能でございます。本体を使用できる状態にする事やデータ復旧のみなどお客様のご要望に沿った内容でご案内が可能です。' },
      { q: '修理歴ありでも対応可能？', a: '修理歴のある端末でも対応可能でございます。ただし非純正パーツが使用されている場合は機能回復ができない場合もございますのでご相談下さい。' },
      { q: '水没した端末も対応できる？', a: '水没した端末も修理可能でございます。水没したかも？と思った場合は電源を入れないようにお願い致します。水分に電気が通ってしまう事が故障の原因となります。' },
      { q: 'データは消去される？', a: '基本的にはデータが消去される事はございません。データ消去が必要な際は必ずお客様にご了承を頂いてから作業を行いますのでご安心下さいませ。' },
      { q: '修理後の保証はある？', a: '修理後は90日間の保証がついております。修理後に何か不具合が生じた場合は再修理可能ですのでご安心下さい。' },
    ],
  },
  other: {
    label: 'その他の質問',
    questions: [
      { q: '修理見積りは無料でできる？', a: 'LINEにて無料で仮見積もりが可能でございます。最初の選択肢を進んで頂くか、画面下のメニュー画面からお見積りにお進みください。' },
      { q: '大量修理は対応できる？', a: '法人や学校などの大量依頼も承っております。お気軽にご相談下さいませ。' },
      { q: '修理のキャンセルはできる？', a: '部品発注前であればキャンセル可能です。発注後は部品代のみご負担いただく場合があります。' },
      { q: '修理料金はいつ確定する？', a: '店舗で検証を行い、本見積もりの際に料金が確定致します。LINEでの仮見積もりは概算費用となりますのでご了承お願い致します。' },
      { q: '個人情報の管理は安全？', a: '下記ボタンより利用規約・プライバシーポリシーをご確認お願い致します。', special: 'privacy_policy' },
      { q: '電話/チャットで相談したい', a: '', special: 'phone' },
    ],
  },
};

// ---- Repair Flow Flex builders ----

function buildContactFormFlex(formUrl: string): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: 'お問い合わせフォーム', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'お名前・電話番号・機種・症状をご入力ください\n担当者より直接お電話いたします📞', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', margin: 'lg',
          contents: [
            {
              type: 'button',
              action: { type: 'uri', label: 'フォームへ進む →', uri: formUrl },
              style: 'primary',
              height: 'sm',
              color: '#00B900',
            },
          ],
        },
      ],
    },
  });
}

function buildProductSelectFlex(): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: '機種を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'お手持ちのMacBookの種類をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'message', label: 'MacBook Air', text: 'MacBook Air' }, style: 'primary', height: 'sm', color: '#00B900' },
            { type: 'button', action: { type: 'message', label: 'MacBook Pro', text: 'MacBook Pro' }, style: 'primary', height: 'sm', color: '#00B900', margin: 'sm' },
            { type: 'button', action: { type: 'message', label: 'その他', text: 'その他' }, style: 'secondary', height: 'sm', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildModelMethodFlex(productName: string, productKey: string): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: productName, weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'モデルの特定方法をお選びください', size: 'sm', color: '#64748b', wrap: true, margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'message', label: 'モデル名で選ぶ', text: 'モデル名で選ぶ' }, style: 'primary', height: 'sm', color: '#00B900' },
            { type: 'button', action: { type: 'message', label: '年式で選ぶ', text: '年式で選ぶ' }, style: 'primary', height: 'sm', color: '#00B900', margin: 'sm' },
            { type: 'button', action: { type: 'message', label: 'わからない', text: 'わからない' }, style: 'secondary', height: 'sm', margin: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildModelSelectFlex(productKey: string): string {
  const modelsByProduct: Record<string, string[]> = {
    air: ['A2941', 'A2681', 'A2337', 'A2179', 'A1932', 'A1466', 'A1369'],
    pro: ['A2338', 'A2141', 'A1990', 'A1989', 'A1708', 'A1707', 'A1502'],
  };
  const models = modelsByProduct[productKey] ?? [];
  const otherButton = {
    type: 'button',
    action: { type: 'message', label: 'その他・分からない', text: 'その他・分からない' },
    style: 'secondary',
    height: 'sm',
  };

  // Split into bubbles of 4 buttons each to stay within LINE's rendering limit
  const chunks: string[][] = [];
  for (let i = 0; i < models.length; i += 4) {
    chunks.push(models.slice(i, i + 4));
  }

  const bubbles = chunks.map((chunk, idx) => {
    const isLast = idx === chunks.length - 1;
    return {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'モデル番号を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
            contents: [
              ...chunk.map((m) => ({
                type: 'button',
                action: { type: 'message', label: m, text: m },
                style: 'primary',
                height: 'sm',
                color: '#00B900',
              })),
              ...(isLast ? [otherButton] : []),
            ],
          },
        ],
      },
    };
  });

  return JSON.stringify({ type: 'carousel', contents: bubbles });
}

function buildYearSelectFlex(): string {
  const recentYears = [2025, 2024, 2023, 2022, 2021];
  const olderYears = [2020, 2019, 2018, 2017];
  const makeBubble = (years: number[], includeOther: boolean) => ({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: '年式を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            ...years.map((y) => ({
              type: 'button',
              action: { type: 'message', label: `${y}年`, text: `${y}年` },
              style: 'primary',
              height: 'sm',
              color: '#00B900',
            })),
            ...(includeOther ? [{ type: 'button', action: { type: 'message', label: 'その他の年式', text: 'その他の年式' }, style: 'secondary', height: 'sm' }] : []),
          ],
        },
      ],
    },
  });
  return JSON.stringify({
    type: 'carousel',
    contents: [makeBubble(recentYears, false), makeBubble(olderYears, true)],
  });
}

function buildInchSelectFlex(): string {
  const sizes = ['13インチ', '14インチ', '15インチ', '16インチ'];
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: 'インチ数を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            ...sizes.map((s) => ({
              type: 'button',
              action: { type: 'message', label: s, text: s },
              style: 'primary',
              height: 'sm',
              color: '#00B900',
            })),
            { type: 'button', action: { type: 'message', label: 'その他・分からない', text: 'その他・分からない' }, style: 'secondary', height: 'sm' },
          ],
        },
      ],
    },
  });
}

function buildStoreSelectFlex(): string {
  const chunkSize = 5;
  const bubbles = [];
  for (let i = 0; i < STORES.length; i += chunkSize) {
    const chunk = STORES.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= STORES.length;
    bubbles.push({
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
        contents: [
          { type: 'text', text: '店舗を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
          { type: 'separator', margin: 'lg' },
          {
            type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
            contents: [
              ...chunk.map((s) => ({
                type: 'button',
                action: { type: 'message', label: s.shortName, text: s.shortName },
                style: 'primary',
                height: 'sm',
                color: '#00B900',
              })),
              ...(isLast ? [{
                type: 'button',
                action: { type: 'message', label: '該当店舗なし', text: '該当店舗なし' },
                style: 'secondary',
                height: 'sm',
              }] : []),
            ],
          },
        ],
      },
    });
  }
  return JSON.stringify({ type: 'carousel', contents: bubbles });
}

function buildConsultCategoryFlex(): string {
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: 'ご質問・ご相談', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'text', text: 'カテゴリをお選びください', size: 'sm', color: '#64748b', margin: 'md' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: [
            { type: 'button', action: { type: 'message', label: '郵送修理に関する質問', text: '郵送修理に関する質問' }, style: 'secondary', height: 'sm' },
            { type: 'button', action: { type: 'message', label: '店頭修理に関する質問', text: '店頭修理に関する質問' }, style: 'secondary', height: 'sm' },
            { type: 'button', action: { type: 'message', label: '修理端末に関する質問', text: '修理端末に関する質問' }, style: 'secondary', height: 'sm' },
            { type: 'button', action: { type: 'message', label: 'その他の質問', text: 'その他の質問' }, style: 'secondary', height: 'sm' },
            { type: 'button', action: { type: 'message', label: '電話/チャットで相談する', text: '電話/チャットで相談する' }, style: 'primary', height: 'sm', color: '#00B900' },
          ],
        },
      ],
    },
  });
}

function buildFaqListFlex(category: string): string {
  const cat = CONSULT_FAQS[category];
  if (!cat) return buildConsultCategoryFlex();
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: cat.label, weight: 'bold', size: 'lg', color: '#1e293b', wrap: true },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: cat.questions.map((faq, idx) => ({
            type: 'button',
            action: { type: 'message', label: faq.q, text: faq.q },
            style: 'secondary',
            height: 'sm',
          })),
        },
      ],
    },
  });
}

async function buildSymptomSelectFlex(db: D1Database, productId: string): Promise<string> {
  const symptoms = await getRepairSymptomsByProduct(db, productId);
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
      contents: [
        { type: 'text', text: '症状を選択してください', weight: 'bold', size: 'lg', color: '#1e293b' },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg',
          contents: symptoms.map((s) => ({
            type: 'button',
            action: { type: 'message', label: s.name, text: s.name },
            style: 'primary',
            height: 'sm',
            color: '#00B900',
          })),
        },
      ],
    },
  });
}

function getSymptomImageUrl(symptom: string): string {
  if (symptom.includes('画面割れ') || symptom.includes('液晶')) {
    return 'https://drive.google.com/uc?export=view&id=19hYbtHjdQs1gGyaRg48hsP7aouSJ6-aF';
  }
  if (symptom.includes('バッテリー') || symptom.includes('充電')) {
    return 'https://drive.google.com/uc?export=view&id=1uBpEGDAGu3TmEC4IEiqhTJYmhqt-fCiU';
  }
  if (symptom.includes('電源')) {
    return 'https://drive.google.com/uc?export=view&id=1KAM3V-r3dYHg6JyK-ZD9rjpgiMJmd1Pg';
  }
  return 'https://drive.google.com/uc?export=view&id=1o0qKfvHDWWGoKSv2e95XX-ccPhfXBLX2';
}

function buildQuoteFlex(params: {
  productName: string;
  symptomName: string;
  priceFrom: number | null;
  priceTo: number | null;
  deliveryFrom: number | null;
  deliveryTo: number | null;
  deliveryDays?: string | null;
  quoteId: string;
  modelName?: string | null;
  year?: number | null;
  inchSize?: string | null;
}): string {
  const priceStr = params.priceFrom == null
    ? 'お問い合わせください'
    : params.priceTo
    ? `¥${params.priceFrom.toLocaleString()}〜¥${params.priceTo.toLocaleString()}`
    : `¥${params.priceFrom.toLocaleString()}〜`;
  const deliveryStr = params.deliveryDays != null
    ? params.deliveryDays
    : params.deliveryFrom == null
    ? 'お問い合わせください'
    : params.deliveryTo
    ? `${params.deliveryFrom}〜${params.deliveryTo}日`
    : `${params.deliveryFrom}日〜`;

  const modelRow = params.modelName
    ? [{ type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: 'モデル番号', size: 'sm', color: '#64748b', flex: 2 },
        { type: 'text', text: params.modelName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3, wrap: true },
      ]}]
    : params.year
    ? [{ type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: '年式', size: 'sm', color: '#64748b', flex: 2 },
        { type: 'text', text: `${params.year}年　${params.inchSize ?? ''}`.trim(), size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
      ]}]
    : [];

  return JSON.stringify({
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#00B900',
      contents: [{ type: 'text', text: '修理見積り', color: '#ffffff', weight: 'bold', size: 'xl' }],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'sm',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '機種', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.productName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        ...modelRow,
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '症状', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: params.symptomName, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3, wrap: true },
        ]},
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '修理費用', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: priceStr, size: 'sm', color: '#00B900', weight: 'bold', flex: 3 },
        ], margin: 'md' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: '納期目安', size: 'sm', color: '#64748b', flex: 2 },
          { type: 'text', text: deliveryStr, size: 'sm', color: '#1e293b', weight: 'bold', flex: 3 },
        ]},
        { type: 'text', text: '※診断後に正式な費用をお伝えします', size: 'xs', color: '#94a3b8', wrap: true, margin: 'lg' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'message', label: '郵送で依頼する', text: '郵送で依頼する' }, style: 'primary', height: 'sm', color: '#00B900' },
        { type: 'button', action: { type: 'message', label: '店舗に持込む', text: '店舗に持込む' }, style: 'primary', height: 'sm', color: '#00B900' },
        { type: 'button', action: { type: 'message', label: '訪問修理で依頼する', text: '訪問修理で依頼する' }, style: 'primary', height: 'sm', color: '#06C755' },
        { type: 'button', action: { type: 'message', label: '質問・相談したい', text: '質問・相談したい' }, style: 'secondary', height: 'sm' },
      ],
    },
  });
}

// ---- Logging helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineMessage = any;

function extractLogContent(msg: LineMessage): { type: string; content: string } {
  if (msg.type === 'flex') return { type: 'flex', content: JSON.stringify(msg.contents ?? {}) };
  if (msg.type === 'image') return { type: 'image', content: (msg.originalContentUrl as string) || '' };
  return { type: 'text', content: (msg.text as string) || '' };
}

async function logFriendAction(
  db: D1Database,
  friendId: string,
  actionType: string,
  actionLabel: string,
  actionData?: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .prepare(`INSERT INTO friend_action_logs (id, friend_id, action_type, action_label, action_data, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), friendId, actionType, actionLabel, actionData ? JSON.stringify(actionData) : null, jstNow())
      .run();
  } catch (err) {
    console.error('logFriendAction error:', err);
  }
}

async function replyAndLog(
  db: D1Database,
  lineClient: LineClient,
  replyToken: string,
  friendId: string,
  messages: LineMessage[],
): Promise<void> {
  await lineClient.replyMessage(replyToken, messages);
  const baseMs = Date.now();
  for (let i = 0; i < messages.length; i++) {
    const { type, content } = extractLogContent(messages[i]);
    const ts = toJstString(new Date(baseMs + i));
    await db.prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, delivery_type, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, 'reply', ?)`,
    ).bind(crypto.randomUUID(), friendId, type, content, ts).run();
  }
}

async function pushAndLog(
  db: D1Database,
  lineClient: LineClient,
  lineUserId: string,
  friendId: string | null,
  messages: LineMessage[],
): Promise<void> {
  await lineClient.pushMessage(lineUserId, messages);
  if (!friendId) return;
  const baseMs = Date.now();
  for (let i = 0; i < messages.length; i++) {
    const { type, content } = extractLogContent(messages[i]);
    const ts = toJstString(new Date(baseMs + i));
    await db.prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, delivery_type, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, 'push', ?)`,
    ).bind(crypto.randomUUID(), friendId, type, content, ts).run();
  }
}

async function setContactMark(db: D1Database, friendId: string, markId: string): Promise<void> {
  try {
    await db.prepare('UPDATE friends SET contact_mark_id = ? WHERE id = ?').bind(markId, friendId).run();
  } catch (err) {
    console.error('setContactMark error:', err);
  }
}

async function addTagToFriend(db: D1Database, friendId: string, tagName: string): Promise<void> {
  try {
    const tag = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first<{ id: string }>();
    if (!tag) return;
    await db.prepare('INSERT OR IGNORE INTO friend_tags (friend_id, tag_id) VALUES (?, ?)').bind(friendId, tag.id).run();
  } catch (err) {
    console.error('addTagToFriend error:', err);
  }
}

async function removeTagsByNames(db: D1Database, friendId: string, tagNames: string[]): Promise<void> {
  if (tagNames.length === 0) return;
  try {
    const placeholders = tagNames.map(() => '?').join(',');
    await db
      .prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id IN (SELECT id FROM tags WHERE name IN (${placeholders}))`)
      .bind(friendId, ...tagNames)
      .run();
  } catch (err) {
    console.error('removeTagsByNames error:', err);
  }
}

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  lineAccountId: string | null = null,
  workerUrl?: string,
  liffUrl?: string,
  chatworkApiToken?: string,
  chatworkRoomId?: string,
): Promise<void> {
  const source = event.source;
  if (source.type === 'group') {
    console.log('Group message received:', (source as { type: 'group'; groupId: string; userId?: string }).groupId, 'from user:', (source as { type: 'group'; groupId: string; userId?: string }).userId);
  }
  if (source.type === 'room') {
    console.log('Room message received:', (source as { type: 'room'; roomId: string; userId?: string }).roomId, 'from user:', (source as { type: 'room'; roomId: string; userId?: string }).userId);
  }

  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // 既存ユーザーか確認（ブロック解除・再友達追加の検出）
    const existingFriend = await getFriendByLineUserId(db, userId);
    const isReFollow = Boolean(existingFriend);

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // Set line_account_id for multi-account tracking
    if (lineAccountId) {
      await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
        .bind(lineAccountId, friend.id).run();
    }

    // チャット一覧に表示するため chats エントリを作成
    await upsertChatOnMessage(db, friend.id);

    // 友達追加を incoming メッセージとして記録（未読バッジ・チャット一覧表示のため）
    await db.prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
       VALUES (?, ?, 'incoming', 'text', '【友達追加】', NULL, NULL, 0, ?)`
    ).bind(crypto.randomUUID(), friend.id, jstNow()).run();

    // ウェルカムメッセージ（新規・再フォロー共通で送信）
    // liffUrl が設定されている場合（staging）はフォームボタン、それ以外は機種選択Flex
    try {
      if (liffUrl) {
        const formUrl = `${liffUrl.trim()}?page=contact-form`;
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          { type: 'image', originalContentUrl: 'https://drive.google.com/uc?export=view&id=1boQgzjVoeLvP9uf-PTUQkVsqPd3wM_Zb', previewImageUrl: 'https://drive.google.com/uc?export=view&id=1boQgzjVoeLvP9uf-PTUQkVsqPd3wM_Zb' },
          { type: 'text', text: 'ご相談ありがとうございます！\n\n下記フォームよりお名前・電話番号・機種・症状をご入力ください。\n担当者より直接お電話させていただきます📞\n\n※修理時にデータに触れる事はございません！\nデータそのままで修理可能です✨' },
          buildMessage('flex', buildContactFormFlex(formUrl)),
        ]);
      } else {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          { type: 'image', originalContentUrl: 'https://drive.google.com/uc?export=view&id=1boQgzjVoeLvP9uf-PTUQkVsqPd3wM_Zb', previewImageUrl: 'https://drive.google.com/uc?export=view&id=1boQgzjVoeLvP9uf-PTUQkVsqPd3wM_Zb' },
          { type: 'text', text: 'お見積りを作成させて頂きますのでお客様の端末情報を下記選択肢よりお選び下さい💻\n\n※修理時にデータに触れる事はございません！\nデータそのままで修理可能です✨' },
          buildMessage('flex', buildProductSelectFlex()),
        ]);
      }
    } catch (err) {
      console.error('Failed to send welcome message:', err);
    }

    // 再フォロー（ブロック解除）の場合はオートメーション・シナリオをスキップ
    if (isReFollow) {
      console.log(`Re-follow detected for ${userId}, skipping automation and scenarios`);
      return;
    }

    // 新規ユーザーのみ: friend_add シナリオに登録
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // Only trigger scenarios belonging to this account (or unassigned for backward compat)
      const scenarioAccountMatch = !scenario.line_account_id || !lineAccountId || scenario.line_account_id === lineAccountId;
      if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now via replyMessage (free)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const expandedContent = expandVariables(firstStep.message_content, friend as { id: string; display_name: string | null; user_id: string | null });
                const message = buildMessage(firstStep.message_type, expandedContent);
                await replyAndLog(db, lineClient, event.replyToken, friend.id, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  // Enforce 9:00-21:00 JST delivery window
                  const h = nextDeliveryDate.getUTCHours();
                  if (h < 9 || h >= 21) {
                    if (h >= 21) nextDeliveryDate.setUTCDate(nextDeliveryDate.getUTCDate() + 1);
                    nextDeliveryDate.setUTCHours(9, 0, 0, 0);
                  }
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // 新規ユーザーのみ: アクションログ・イベントバス発火・対応マーク設定
    await logFriendAction(db, friend.id, 'friend_add', '友達追加');
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken, lineAccountId);
    await setContactMark(db, friend.id, 'mark_01');
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    let friend = await getFriendByLineUserId(db, userId);
    if (!friend) {
      // User exists on LINE but not in DB (e.g. migrated from another tool)
      let profile;
      try { profile = await lineClient.getProfile(userId); } catch { /* ignore */ }
      friend = await upsertFriend(db, {
        lineUserId: userId,
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        statusMessage: profile?.statusMessage ?? null,
      });
      if (lineAccountId) {
        await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
          .bind(lineAccountId, friend.id).run();
      }
      console.log(`Auto-registered friend from message: ${userId} (${profile?.displayName ?? 'unknown'})`);
    }

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // ボタンタップ相当のキーワード判定（これらは is_read = 1 として扱う）
    const MODEL_NUMBERS = new Set(['A2991','A2780','A2485','A2141','A3241','A3114','A2941','A1990','A1707','A3434','A3401','A3112','A3185','A2779','A2992','A2918','A2442','A3240','A3113','A2681','A2338','A2289','A2251','A2337','A2179','A2159','A1708','A1932','A1989','A1706','A1502','A2369']);
    const INCH_SIZES = new Set(['13インチ','14インチ','15インチ','16インチ']);
    const REPAIR_FLOW_KEYWORDS = new Set([
      '見積もりを始める', '修理依頼をする', 'ご依頼の流れを教えて', 'よくある質問',
      '店舗の場所は？', 'MacBook Air', 'MacBook Pro', 'その他',
      'モデル名で選ぶ', '年式で選ぶ', 'わからない', 'その他の年式', 'その他・分からない',
      '郵送で依頼する', '店舗に持込む', '質問・相談したい', '訪問修理で依頼する',
      '来店予約する', '該当店舗なし', '電話/チャットで相談する',
      '郵送修理に関する質問', '店頭修理に関する質問', '修理端末に関する質問', 'その他の質問',
    ]);
    const autoKeywords = ['料金', '機能', 'API', 'フォーム', 'ヘルプ', 'UUID', 'UUID連携について教えて', 'UUID連携を確認', '配信時間', '導入支援を希望します', 'アカウント連携を見る', '体験を完了する', 'BAN対策を見る', '連携確認'];
    const isTimeCommand = /(?:配信時間|配信|届けて|通知)[はを]?\s*\d{1,2}\s*時/.test(incomingText);
    const isYearInput = /^(\d{4})年$/.test(incomingText);
    const isStoreShortName = (STORES as { shortName: string }[]).some(s => s.shortName === incomingText);
    const isFaqQuestion = Object.values(CONSULT_FAQS).some(cat => cat.questions.some(faq => faq.q === incomingText));
    const isSymptomName = !!(await db.prepare('SELECT 1 FROM repair_symptoms WHERE name = ? LIMIT 1').bind(incomingText).first());
    const isAutoKeyword = autoKeywords.some(k => incomingText === k)
      || REPAIR_FLOW_KEYWORDS.has(incomingText)
      || MODEL_NUMBERS.has(incomingText)
      || INCH_SIZES.has(incomingText)
      || isYearInput || isStoreShortName || isFaqQuestion || isSymptomName || isTimeCommand;

    // 受信メッセージをログに記録（フリーテキストのみ未読、ボタンタップ相当は既読）
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?, ?)`,
      )
      .bind(logId, friend.id, incomingText, isAutoKeyword ? 1 : 0, now)
      .run();

    // チャットを作成/更新（全メッセージ対象 — ボタンタップ含む）
    await upsertChatOnMessage(db, friend.id);

    // 配信時間設定: 「配信時間は○時」「○時に届けて」等のパターンを検出
    const timeMatch = incomingText.match(/(?:配信時間|配信|届けて|通知)[はを]?\s*(\d{1,2})\s*時/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= 6 && hour <= 22) {
        // Save preferred_hour to friend metadata
        const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
        const meta = JSON.parse(existing?.metadata || '{}');
        meta.preferred_hour = hour;
        await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(meta), jstNow(), friend.id).run();

        // Reply with confirmation
        try {
          const period = hour < 12 ? '午前' : '午後';
          const displayHour = hour <= 12 ? hour : hour - 12;
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: '配信時間を設定しました', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'box', layout: 'vertical', contents: [
                  { type: 'text', text: `${period} ${displayHour}:00`, size: 'xxl', weight: 'bold', color: '#f59e0b', align: 'center' },
                  { type: 'text', text: `（${hour}:00〜）`, size: 'sm', color: '#64748b', align: 'center', margin: 'sm' },
                ], backgroundColor: '#fffbeb', cornerRadius: 'md', paddingAll: '20px', margin: 'lg' },
                { type: 'text', text: '今後のステップ配信はこの時間以降にお届けします。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
              ], paddingAll: '20px' },
            })),
          ]);
        } catch (err) {
          console.error('Failed to reply for time setting', err);
        }
        return;
      }
    }

    // Cross-account trigger: send message from another account via UUID
    if (incomingText === '体験を完了する' && lineAccountId) {
      try {
        const friendRecord = await db.prepare('SELECT user_id FROM friends WHERE id = ?').bind(friend.id).first<{ user_id: string | null }>();
        if (friendRecord?.user_id) {
          // Find the same user on other accounts
          const otherFriends = await db.prepare(
            'SELECT f.id, f.line_user_id, la.channel_access_token FROM friends f INNER JOIN line_accounts la ON la.id = f.line_account_id WHERE f.user_id = ? AND f.line_account_id != ? AND f.is_following = 1'
          ).bind(friendRecord.user_id, lineAccountId).all<{ id: string; line_user_id: string; channel_access_token: string }>();

          for (const other of otherFriends.results) {
            const otherClient = new LineClient(other.channel_access_token);
            await pushAndLog(db, otherClient, other.line_user_id, other.id, [buildMessage('flex', JSON.stringify({
              type: 'bubble', size: 'giga',
              header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#fffbeb',
                contents: [{ type: 'text', text: `${friend.display_name || ''}さんへ`, size: 'lg', weight: 'bold', color: '#1e293b' }],
              },
              body: { type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'text', text: '別アカウントからのアクションを検知しました。', size: 'sm', color: '#06C755', weight: 'bold', wrap: true },
                  { type: 'text', text: 'アカウント連携が正常に動作しています。体験ありがとうございました。', size: 'sm', color: '#1e293b', wrap: true, margin: 'md' },
                  { type: 'separator', margin: 'lg' },
                  { type: 'text', text: 'ステップ配信・フォーム即返信・アカウント連携・リッチメニュー・自動返信 — 全て無料、全てOSS。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
                ],
              },
              footer: { type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [
                  { type: 'button', action: { type: 'message', label: '導入について相談する', text: '導入支援を希望します' }, style: 'primary', height: 'sm', color: '#06C755' },
                  ...(liffUrl ? [{ type: 'button', action: { type: 'uri', label: 'フィードバックを送る', uri: `${liffUrl}?page=form` }, style: 'secondary', height: 'sm', margin: 'sm' }] : []),
                ],
              },
            }))]);
          }

          // Reply on Account ② confirming
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'text', text: 'Account ① にメッセージを送りました', size: 'sm', color: '#06C755', weight: 'bold', align: 'center' },
                { type: 'text', text: 'Account ① のトーク画面を確認してください', size: 'xs', color: '#64748b', align: 'center', margin: 'md' },
              ],
            },
          }))]);
          return;
        }
      } catch (err) {
        console.error('Cross-account trigger error:', err);
      }
    }

    // ===== Repair flow: message button text matching =====
    const CONSULT_CATEGORY_MAP: Record<string, string> = { '郵送修理に関する質問':'mail','店頭修理に関する質問':'store','修理端末に関する質問':'device','その他の質問':'other' };

    // リッチメニュー: 見積もりを始める
    if (incomingText === '見積もりを始める') {
      await setContactMark(db, friend.id, 'mark_17');
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildProductSelectFlex())]); } catch (err) { console.error('richmenu 見積もりを始める:', err); }
      return;
    }

    if (incomingText === '修理依頼をする') {
      await logFriendAction(db, friend.id, 'menu_repair', '修理依頼をする');
      await setContactMark(db, friend.id, 'mark_17');
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildProductSelectFlex())]); } catch (err) { console.error('修理依頼をする text handler:', err); }
      return;
    }

    // リッチメニュー: ご依頼の流れを教えて
    if (incomingText === 'ご依頼の流れを教えて') {
      const flowFlex = JSON.stringify({
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#00B900',
          contents: [{ type: 'text', text: 'ご依頼の流れ', color: '#ffffff', weight: 'bold', size: 'xl' }],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
          contents: [
            { type: 'text', text: '①LINEで仮見積もり＆お申込み', weight: 'bold', size: 'sm', color: '#1e293b' },
            { type: 'text', text: 'LINEで機種や状態を送るとその場で仮見積もりが可能です！\n仮見積もりにご納得頂けましたら、そのまま修理依頼に進めます。', size: 'sm', color: '#64748b', wrap: true },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: '②発送or来店', weight: 'bold', size: 'sm', color: '#1e293b', margin: 'md' },
            { type: 'text', text: '郵送修理の場合は梱包して発送！\n送料無料ですので着払いでお送り下さい。\n店頭持込の場合は店舗までご来店下さい。', size: 'sm', color: '#64748b', wrap: true },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: '③本見積もり', weight: 'bold', size: 'sm', color: '#1e293b', margin: 'md' },
            { type: 'text', text: '端末の状態を確認させて頂き、本見積もりを出させて頂きます。\n料金にご納得頂けない場合はキャンセルも可能です。', size: 'sm', color: '#64748b', wrap: true },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: '④修理＆ご返却', weight: 'bold', size: 'sm', color: '#1e293b', margin: 'md' },
            { type: 'text', text: '本見積もりでご了承いただけた場合は修理致します！\nお支払い後ご返却となります。', size: 'sm', color: '#64748b', wrap: true },
          ],
        },
      });
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', flowFlex)]); } catch (err) { console.error('richmenu ご依頼の流れ:', err); }
      return;
    }

    // リッチメニュー: よくある質問
    if (incomingText === 'よくある質問') {
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildConsultCategoryFlex())]); } catch (err) { console.error('richmenu よくある質問:', err); }
      return;
    }

    // リッチメニュー: 店舗の場所は？ → 店舗選択Flex（既存 store select_store ハンドラーへ転送）
    if (incomingText === '店舗の場所は？') {
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildStoreSelectFlex())]); } catch (err) { console.error('richmenu 店舗の場所は？:', err); }
      return;
    }

    // 機種選択
    if (incomingText === 'MacBook Air' || incomingText === 'MacBook Pro' || incomingText === 'その他') {
      await logFriendAction(db, friend.id, 'product_select', incomingText);
      const productMap: Record<string, { key: string; id: string }> = {
        'MacBook Air': { key: 'air', id: 'prod-air-0001-0000-0000-000000000001' },
        'MacBook Pro': { key: 'pro', id: 'prod-pro-0001-0000-0000-000000000002' },
        'その他':      { key: 'other', id: 'prod-oth-0001-0000-0000-000000000003' },
      };
      const p = productMap[incomingText];
      await setFriendAttribute(db, friend.id, 'repair_product_id', p.id);
      await setFriendAttribute(db, friend.id, 'repair_product_name', incomingText);
      await setFriendAttribute(db, friend.id, 'repair_product_key', p.key);
      const macTagName = incomingText === 'MacBook Air' ? 'MacbookAir' : incomingText === 'MacBook Pro' ? 'MacbookPro' : 'その他';
      await removeTagsByNames(db, friend.id, ['MacbookAir', 'MacbookPro', 'その他'].filter(t => t !== macTagName));
      await addTagToFriend(db, friend.id, macTagName);
      if (incomingText === 'その他') {
        try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch (err) { console.error('repair msg other product:', err); }
      } else {
        try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildModelMethodFlex(incomingText, p.key))]); } catch (err) { console.error('repair msg select_product:', err); }
      }
      return;
    }

    // モデル特定方法
    if (incomingText === 'モデル名で選ぶ') {
      const productKey = (await getFriendAttribute(db, friend.id, 'repair_product_key')) ?? 'other';
      // モデル名選択フローに入る際、前回セッションの年式を消去（その他・分からない の分岐判定に使うため）
      await setFriendAttribute(db, friend.id, 'repair_year', '');
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildModelSelectFlex(productKey))]); } catch (err) { console.error('repair msg choose_model_method:', err); }
      return;
    }
    if (incomingText === '年式で選ぶ') {
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildYearSelectFlex())]); } catch (err) { console.error('repair msg choose_year_method:', err); }
      return;
    }
    if (incomingText === 'わからない') {
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch (err) { console.error('repair msg skip_model:', err); }
      return;
    }

    // モデル番号選択
    if (MODEL_NUMBERS.has(incomingText)) {
      await setFriendAttribute(db, friend.id, 'repair_model_name', incomingText);
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id')) ?? 'prod-oth-0001-0000-0000-000000000003';
      try { const sf = await buildSymptomSelectFlex(db, productId); await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', sf)]); } catch (err) { console.error('repair msg select_model:', err); }
      return;
    }

    // 年式選択
    {
      const yearTextMatch = incomingText.match(/^(\d{4})年$/);
      if (yearTextMatch) {
        await setFriendAttribute(db, friend.id, 'repair_year', yearTextMatch[1]);
        try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildInchSelectFlex())]); } catch (err) { console.error('repair msg select_year:', err); }
        return;
      }
    }
    if (incomingText === 'その他の年式') {
      await setFriendAttribute(db, friend.id, 'repair_year', '0');
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch (err) { console.error('repair msg select_year_other:', err); }
      return;
    }

    // インチ選択
    if (INCH_SIZES.has(incomingText)) {
      await setFriendAttribute(db, friend.id, 'repair_inch_size', incomingText);
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id')) ?? 'prod-oth-0001-0000-0000-000000000003';
      try { const sf = await buildSymptomSelectFlex(db, productId); await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', sf)]); } catch (err) { console.error('repair msg select_inch:', err); }
      return;
    }

    // 「その他・分からない」: yearが設定済み → インチ不明（問い合わせテキスト）, そうでなければ → モデル不明（年式選択へ）
    if (incomingText === 'その他・分からない') {
      const yearStr = await getFriendAttribute(db, friend.id, 'repair_year');
      if (yearStr) {
        await setFriendAttribute(db, friend.id, 'repair_inch_size', 'その他・分からない');
        try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch (err) { console.error('repair msg other inch:', err); }
      } else {
        await setFriendAttribute(db, friend.id, 'repair_model_name', 'その他・分からない');
        try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildYearSelectFlex())]); } catch (err) { console.error('repair msg other model:', err); }
      }
      return;
    }

    // 症状選択 (DB symptom name lookup)
    {
      const symptomRow = await db.prepare('SELECT id, name FROM repair_symptoms WHERE name = ? LIMIT 1').bind(incomingText).first<{ id: string; name: string }>();
      if (symptomRow) {
        await logFriendAction(db, friend.id, 'symptom_select', symptomRow.name);
        const symptomId = symptomRow.id;
        const symptomName = symptomRow.name;
        const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id')) ?? 'prod-oth-0001-0000-0000-000000000003';
        const productName = (await getFriendAttribute(db, friend.id, 'repair_product_name')) ?? 'MacBook';
        const modelName = await getFriendAttribute(db, friend.id, 'repair_model_name');
        const yearStr = await getFriendAttribute(db, friend.id, 'repair_year');
        const inchSize = await getFriendAttribute(db, friend.id, 'repair_inch_size');
        await setFriendAttribute(db, friend.id, 'repair_symptom_id', symptomId);

        let priceFrom: number | null = null;
        let priceTo: number | null = null;
        let deliveryFrom: number | null = null;
        let deliveryTo: number | null = null;
        let deliveryDays: string | null = null;
        let resolvedModelName: string | null = modelName ?? null;

        if (modelName && modelName !== 'その他・分からない') {
          const row = await getRepairModelPrice(db, modelName, symptomName);
          if (!row) {
            try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: MISSING_MODEL_MESSAGE }]); } catch {}
            return;
          }
          if (row.inquiry_only) {
            try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch {}
            return;
          }
          priceFrom = row.price; deliveryDays = row.delivery_days;
        } else if (yearStr && inchSize && inchSize !== 'その他・分からない') {
          const productType = productName.toLowerCase().includes('air') ? 'air' : productName.toLowerCase().includes('pro') ? 'pro' : 'other';
          const row = await getRepairPriceByYearInch(db, productType, parseInt(yearStr, 10), parseFloat(inchSize), symptomName);
          if (!row) {
            try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: MISSING_MODEL_MESSAGE }]); } catch {}
            return;
          }
          if (row.inquiry_only) {
            try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch {}
            return;
          }
          priceFrom = row.price; deliveryDays = row.delivery_days; resolvedModelName = row.model_number;
        } else {
          const price = await getRepairPrice(db, productId, symptomId);
          if (price) { priceFrom = price.price_from; priceTo = price.price_to; deliveryFrom = price.delivery_days_from; deliveryTo = price.delivery_days_to; }
        }

        try {
          const quote = await createRepairQuote(db, { friendId: friend.id, productId, symptomId, modelName: resolvedModelName ?? productName, year: yearStr ? parseInt(yearStr, 10) : null, priceFrom, priceTo, deliveryDaysFrom: deliveryFrom, deliveryDaysTo: deliveryTo });
          await setFriendAttribute(db, friend.id, 'repair_quote_id', quote.id);
          const symptomImageUrl = getSymptomImageUrl(symptomName);
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'image', originalContentUrl: symptomImageUrl, previewImageUrl: symptomImageUrl },
            buildMessage('flex', buildQuoteFlex({ productName, symptomName, priceFrom, priceTo, deliveryFrom, deliveryTo, deliveryDays, quoteId: quote.id, modelName: resolvedModelName, year: yearStr ? parseInt(yearStr, 10) : null, inchSize })),
          ]);
        } catch (err) { console.error('repair msg select_symptom:', err); }
        return;
      }
    }

    // 依頼方法
    if (incomingText === '郵送で依頼する' || incomingText === '店舗に持込む' || incomingText === '質問・相談したい') {
      if (incomingText === '質問・相談したい') { await logFriendAction(db, friend.id, 'consult', '質問・相談したい'); }
      else { await logFriendAction(db, friend.id, 'delivery_method', incomingText); }
      const quoteId = (await getFriendAttribute(db, friend.id, 'repair_quote_id')) ?? '';
      const typeMap: Record<string, 'mail' | 'store' | 'consult'> = { '郵送で依頼する': 'mail', '店舗に持込む': 'store', '質問・相談したい': 'consult' };
      const type = typeMap[incomingText];
      if (quoteId) await updateRepairQuoteRequestType(db, quoteId, type);
      try {
        if (type === 'mail') {
          await removeTagsByNames(db, friend.id, ['依頼しない', 'タグなし']);
          await addTagToFriend(db, friend.id, '依頼する');
          await addTagToFriend(db, friend.id, '郵送依頼');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'text', text: '下記ボタンよりお申し込みをよろしくお願い申し上げます！' },
            buildMessage('flex', JSON.stringify({ type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [{ type: 'button', action: { type: 'uri', label: '郵送修理ご依頼フォーム', uri: MAIL_REPAIR_FORM_URL }, style: 'primary', height: 'sm', color: '#00B900' }] } })),
          ]);
        } else if (type === 'store') {
          await removeTagsByNames(db, friend.id, ['依頼しない', 'タグなし']);
          await addTagToFriend(db, friend.id, '依頼する');
          await addTagToFriend(db, friend.id, '店舗持込');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: {
                type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
                contents: [
                  { type: 'text', text: '来店予約フォーム', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                  { type: 'text', text: 'ご希望の日時を選択してご予約ください。予約完了後、LINEに確認メッセージをお送りします。', wrap: true, size: 'sm', color: '#555555' },
                ],
              },
              footer: {
                type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [{ type: 'button', action: { type: 'uri', label: '来店予約をする', uri: STORE_RESERVATION_URL_GENERAL }, style: 'primary', height: 'sm', color: '#06C755' }],
              },
            })),
          ]);
        } else {
          await removeTagsByNames(db, friend.id, ['依頼する']);
          await addTagToFriend(db, friend.id, '依頼しない');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildConsultCategoryFlex())]);
        }
      } catch (err) { console.error('repair msg request_type:', err); }
      return;
    }

    // 来店予約ボタンタップ → LIFF予約フォームへ誘導
    if (incomingText === '来店予約する') {
      await logFriendAction(db, friend.id, 'delivery_method', '来店予約する');
      await removeTagsByNames(db, friend.id, ['タグなし']);
      await addTagToFriend(db, friend.id, '店舗持込');
      // 選択済み店舗があればURLに含める
      const repairStore = await getFriendAttribute(db, friend.id, 'repair_store');
      const storeKey = repairStore ? Object.entries({
        '五反田店': 'gotanda', '錦糸町店': 'kinshicho', '成田店': 'narita', '幕張店': 'makuhari',
        '菖蒲店': 'shobu', '岐阜店': 'gifu', '宇都宮店': 'utsunomiya', '青森店': 'aomori',
        '盛岡店': 'morioka', '大分店': 'oita', '木津川店': 'kizugawa', '長岡店': 'nagaoka',
      }).find(([name]) => name === repairStore)?.[1] ?? '' : '';
      const reservationUrl = storeKey
        ? `${STORE_RESERVATION_URL_GENERAL}&storeKey=${storeKey}`
        : STORE_RESERVATION_URL_GENERAL;
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
              contents: [
                { type: 'text', text: '来店予約フォーム', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                { type: 'text', text: 'ご希望の日時を選択してご予約ください。予約完了後、LINEに確認メッセージをお送りします。', wrap: true, size: 'sm', color: '#555555' },
              ],
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'button', action: { type: 'uri', label: '来店予約をする', uri: reservationUrl }, style: 'primary', height: 'sm', color: '#00B900' }],
            },
          })),
        ]);
      } catch (err) { console.error('repair msg reservation:', err); }
      return;
    }

    // 訪問修理ボタンタップ → タグ付与＋LIFF誘導
    if (incomingText === '訪問修理で依頼する') {
      await logFriendAction(db, friend.id, 'delivery_method', '訪問修理で依頼する');
      await removeTagsByNames(db, friend.id, ['タグなし']);
      await addTagToFriend(db, friend.id, '訪問修理');
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
              contents: [
                { type: 'text', text: '訪問修理ご依頼フォーム', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                { type: 'text', text: 'ご希望の日時や住所などをご入力ください。', wrap: true, size: 'sm', color: '#555555' },
              ],
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'button', action: { type: 'uri', label: '訪問修理フォームへ進む', uri: 'https://liff.line.me/2010126656-iMP2b4Jw?page=visit-repair' }, style: 'primary', height: 'sm', color: '#06C755' }],
            },
          })),
        ]);
      } catch (err) { console.error('repair msg visit:', err); }
      return;
    }

    // 店舗選択
    {
      const store = (STORES as readonly { key: string; shortName: string; name: string; zip: string; address: string; tel: string; hours: string; reservationUrl: string }[]).find(s => s.shortName === incomingText);
      if (store) {
        await setFriendAttribute(db, friend.id, 'repair_store', store.shortName);
        const storeInfoText = `${store.shortName}での店頭修理をご希望ですね！✨\n下記店舗情報となります🙇‍♂️\n\n${store.name}\n住所：\n${store.zip}\n${store.address}\n電話番号：${store.tel}\n営業時間：${store.hours}\n\nご来店のご予約は下記のボタンからお進みください！`;
        try {
          const storeReservationUrl = `${STORE_RESERVATION_URL_GENERAL}&storeKey=${store.key}`;
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'text', text: storeInfoText },
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: {
                type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
                contents: [
                  { type: 'text', text: '来店予約フォーム', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                  { type: 'text', text: 'ご希望の日時を選択してご予約ください。', wrap: true, size: 'sm', color: '#555555' },
                ],
              },
              footer: {
                type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [{ type: 'button', action: { type: 'uri', label: '来店予約をする', uri: storeReservationUrl }, style: 'primary', height: 'sm', color: '#06C755' }],
              },
            })),
          ]);
        } catch (err) { console.error('repair msg select_store:', err); }
        return;
      }
      if (incomingText === '該当店舗なし') {
        try {
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: {
                type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
                contents: [
                  { type: 'text', text: '郵送修理のご案内', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                  { type: 'text', text: '近くに店舗がない場合は郵送での修理も承っております！全国どこからでもお気軽にご依頼ください。', wrap: true, size: 'sm', color: '#666666' },
                ],
              },
              footer: {
                type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [{ type: 'button', action: { type: 'uri', label: '郵送修理ご依頼フォーム', uri: MAIL_REPAIR_FORM_URL }, style: 'primary', height: 'sm', color: '#06C755' }],
              },
            })),
          ]);
        } catch (err) { console.error('repair msg no store:', err); }
        return;
      }
    }

    // 質問カテゴリ
    if (CONSULT_CATEGORY_MAP[incomingText]) {
      const category = CONSULT_CATEGORY_MAP[incomingText];
      await setFriendAttribute(db, friend.id, 'repair_faq_category', category);
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildFaqListFlex(category))]); } catch (err) { console.error('repair msg consult_category:', err); }
      return;
    }
    if (incomingText === '電話/チャットで相談する') {
      try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULT_PHONE_TEXT }]); } catch (err) { console.error('repair msg consult_phone:', err); }
      return;
    }

    // FAQ質問 (現在のカテゴリ優先で検索)
    {
      const faqCategory = (await getFriendAttribute(db, friend.id, 'repair_faq_category')) ?? '';
      const categoriesToSearch = faqCategory
        ? [faqCategory, ...Object.keys(CONSULT_FAQS).filter(k => k !== faqCategory)]
        : Object.keys(CONSULT_FAQS);
      let matchedFaq: FaqEntry | null = null;
      for (const cat of categoriesToSearch) {
        const entry = CONSULT_FAQS[cat]?.questions.find(faq => faq.q === incomingText);
        if (entry) { matchedFaq = entry; break; }
      }
      if (matchedFaq) {
        try {
          if (matchedFaq.special === 'store_select') {
            await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', buildStoreSelectFlex())]);
          } else if (matchedFaq.special === 'phone') {
            await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULT_PHONE_TEXT }]);
          } else {
            const footerContents: unknown[] = [];
            if (matchedFaq.special === 'reservation_button') footerContents.push({ type: 'button', action: { type: 'message', label: '来店予約する', text: '来店予約する' }, style: 'primary', height: 'sm', color: '#00B900' });
            else if (matchedFaq.special === 'privacy_policy') footerContents.push({ type: 'button', action: { type: 'uri', label: '利用規約・プライバシーポリシー', uri: PRIVACY_POLICY_URL }, style: 'primary', height: 'sm', color: '#00B900' });
            const bubble: Record<string, unknown> = {
              type: 'bubble',
              header: { type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#1e3a5f', contents: [{ type: 'text', text: matchedFaq.q, color: '#ffffff', weight: 'bold', size: 'sm', wrap: true }] },
              body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [{ type: 'text', text: matchedFaq.a, size: 'sm', color: '#333333', wrap: true }] },
            };
            if (footerContents.length > 0) bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '16px', contents: footerContents };
            await replyAndLog(db, lineClient, event.replyToken, friend.id, [buildMessage('flex', JSON.stringify(bubble))]);
          }
        } catch (err) { console.error('repair msg faq_question:', err); }
        return;
      }
    }
    // ===== End repair flow =====

    // Chatwork通知: 選択肢以外の自由入力メッセージのみ
    if (!isAutoKeyword && !isTimeCommand) {
      const cwToken = chatworkApiToken;
      const cwMsg = `[info][title]💬 個別メッセージが届きました[/title]ユーザー：${friend.display_name || userId}\nメッセージ：${incomingText}\n時刻：${jstTimestamp()}\n管理画面：https://macbook-repair-admin.vercel.app[/info]`;

      // 管理者ルームへ通知（既存）
      const cwRoom = chatworkRoomId;
      if (cwToken && cwRoom) {
        sendChatworkMessage(cwToken, cwRoom, cwMsg).catch(() => {});
      }

      // 岐阜店・大分店ユーザー判定 → 各店舗ルームへ通知
      if (cwToken) {
        const STORE_CW: Record<string, { roomId: string; accountId: string; keywords: string[] }> = {
          gifu:  { roomId: '368537823', accountId: '9589322',  keywords: ['gifu', '岐阜'] },
          oita:  { roomId: '288490480', accountId: '7482587',  keywords: ['oita', '大分'] },
        };

        try {
          const storeRows = await db.prepare(`
            SELECT DISTINCT store_name FROM (
              SELECT store_key AS store_name FROM store_reservations WHERE friend_id = ?
              UNION
              SELECT delivery_store AS store_name FROM mail_orders WHERE friend_id = ?
              UNION
              SELECT store AS store_name FROM repair_quotes WHERE friend_id = ? AND store IS NOT NULL
            )
          `).bind(friend.id, friend.id, friend.id).all<{ store_name: string }>();

          const storeNames = storeRows.results.map(r => r.store_name ?? '');

          for (const cfg of Object.values(STORE_CW)) {
            const matched = storeNames.some(s => cfg.keywords.some(k => s.includes(k)));
            if (matched) {
              const storeCwMsg = `[To:${cfg.accountId}]\n${cwMsg}`;
              sendChatworkMessage(cwToken, cfg.roomId, storeCwMsg).catch(() => {});
            }
          }
        } catch (err) {
          console.error('store chatwork notification error:', err);
        }
      }

      // 菖蒲店ユーザー判定 → LINEグループに通知
      try {
        const shobuCheck = await db.prepare(`
          SELECT 1 FROM (
            SELECT store_key AS s FROM store_reservations WHERE friend_id = ? AND store_key = 'shobu'
            UNION
            SELECT delivery_store AS s FROM mail_orders WHERE friend_id = ? AND delivery_store LIKE '%菖蒲%'
            UNION
            SELECT store AS s FROM repair_quotes WHERE friend_id = ? AND store LIKE '%菖蒲%'
          ) LIMIT 1
        `).bind(friend.id, friend.id, friend.id).first();

        if (shobuCheck) {
          const groupMsg = `【菖蒲店】郵送Mac\nユーザー名：${friend.display_name || userId}\nメッセージ：${incomingText}`;
          lineClient.pushMessage('Cddd3e9dd960e52b8b1e400744eef28f4', [{ type: 'text', text: groupMsg }]).catch((err) => {
            console.error('shobu group notification error:', err);
          });
        }
      } catch (err) {
        console.error('shobu store detection error:', err);
      }
    }

    // 自動返信チェック（このアカウントのルール + グローバルルールのみ）
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplies = await db
      .prepare(`SELECT * FROM auto_replies WHERE is_active = 1 AND (line_account_id IS NULL${lineAccountId ? ` OR line_account_id = '${lineAccountId}'` : ''}) ORDER BY created_at ASC`)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains';
        response_type: string;
        response_content: string;
        is_active: number;
        created_at: string;
      }>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          // Expand template variables ({{name}}, {{uid}}, {{auth_url:CHANNEL_ID}})
          const expandedContent = expandVariables(rule.response_content, friend as { id: string; display_name: string | null; user_id: string | null }, workerUrl);
          const replyMsg = buildMessage(rule.response_type, expandedContent);
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [replyMsg]);
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // 自由メッセージ（既知キーワード/自動返信のいずれにも該当しない場合）
    if (!matched && !isAutoKeyword) {
      await logFriendAction(db, friend.id, 'free_message', incomingText.slice(0, 100));
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken, lineAccountId);

    return;
  }

  // 画像・動画・音声メッセージ → messages_log に messageId を保存してチャットに表示
  if (event.type === 'message' && (event.message.type === 'image' || event.message.type === 'video' || event.message.type === 'audio')) {
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;
    let friend = await getFriendByLineUserId(db, userId);
    if (!friend) {
      let profile;
      try { profile = await lineClient.getProfile(userId); } catch { /* ignore */ }
      friend = await upsertFriend(db, {
        lineUserId: userId,
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        statusMessage: profile?.statusMessage ?? null,
      });
      if (lineAccountId) {
        await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
          .bind(lineAccountId, friend.id).run();
      }
      console.log(`Auto-registered friend from media message: ${userId}`);
    }
    const messageId = event.message.id;
    const messageType = event.message.type as string;
    await db.prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
       VALUES (?, ?, 'incoming', ?, ?, NULL, NULL, 0, ?)`
    ).bind(crypto.randomUUID(), friend.id, messageType, JSON.stringify({ messageId }), jstNow()).run();
    await upsertChatOnMessage(db, friend.id);
    return;
  }

  if (event.type === 'postback') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    let friend = await getFriendByLineUserId(db, userId);
    if (!friend) {
      let profile;
      try { profile = await lineClient.getProfile(userId); } catch { /* ignore */ }
      friend = await upsertFriend(db, {
        lineUserId: userId,
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        statusMessage: profile?.statusMessage ?? null,
      });
      if (lineAccountId) {
        await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
          .bind(lineAccountId, friend.id).run();
      }
      console.log(`Auto-registered friend from postback: ${userId}`);
    }

    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');

    // postbackをmessages_logに保存してチャット画面に表示する（ボタンタップは常に既読）
    {
      const displayText = event.postback.displayText;
      const actionLabels: Record<string, () => string> = {
        select_product:    () => `【機種選択】${params.get('name') ?? ''}`,
        choose_model_method: () => 'モデルを選択',
        select_model:      () => `【モデル選択】${params.get('model_name') ?? ''}`,
        choose_year_method: () => '年式・インチで選択',
        skip_model:        () => 'モデルをスキップ',
        select_year:       () => `【年式選択】${params.get('year') ?? ''}年`,
        select_inch:       () => `【インチ選択】${params.get('inch') ?? ''}`,
        select_symptom:    () => `【症状選択】${params.get('symptom_name') ?? ''}`,
        request_type:      () => { const t = params.get('type'); return t === 'mail' ? '【郵送修理を選択】' : t === 'store' ? '【店頭持込を選択】' : '【相談を選択】'; },
        select_store:      () => `【店舗選択】${params.get('store_key') ?? ''}`,
        start_repair:      () => '修理を開始',
        consult_category:  () => `【相談カテゴリ】${params.get('category') ?? ''}`,
        consult_phone:     () => '電話で相談',
        faq_question:      () => '質問を選択',
      };
      const logContent = displayText || actionLabels[action ?? '']?.() || event.postback.data;
      const now = jstNow();
      await db.prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, is_read, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, 1, ?)`,
      ).bind(crypto.randomUUID(), friend.id, logContent, now).run();
      await upsertChatOnMessage(db, friend.id);
    }

    if (action === 'select_product') {
      const productKey = params.get('product') ?? '';
      const productName = params.get('name') ?? '';
      await logFriendAction(db, friend.id, 'product_select', productName || productKey);
      const productIdMap: Record<string, string> = {
        air:   'prod-air-0001-0000-0000-000000000001',
        pro:   'prod-pro-0001-0000-0000-000000000002',
        other: 'prod-oth-0001-0000-0000-000000000003',
      };
      const productId = productIdMap[productKey] ?? productIdMap['other'];
      await setFriendAttribute(db, friend.id, 'repair_product_id', productId);
      await setFriendAttribute(db, friend.id, 'repair_product_name', productName);
      await setFriendAttribute(db, friend.id, 'repair_product_key', productKey);
      await setContactMark(db, friend.id, 'mark_16');
      const macTagNamePb = productKey === 'air' ? 'MacbookAir' : productKey === 'pro' ? 'MacbookPro' : 'その他';
      await removeTagsByNames(db, friend.id, ['MacbookAir', 'MacbookPro', 'その他'].filter(t => t !== macTagNamePb));
      await addTagToFriend(db, friend.id, macTagNamePb);
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildModelMethodFlex(productName, productKey)),
        ]);
      } catch (err) {
        console.error('Failed to send model method flex:', err);
      }
      return;
    }

    if (action === 'choose_model_method') {
      const productKey = params.get('product_key')
        ?? (await getFriendAttribute(db, friend.id, 'repair_product_key'))
        ?? 'other';
      await setFriendAttribute(db, friend.id, 'repair_year', '');
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildModelSelectFlex(productKey)),
        ]);
      } catch (err) {
        console.error('Failed to send model select flex:', err);
      }
      return;
    }

    if (action === 'select_model') {
      const modelName = params.get('model_name') ?? '';
      await logFriendAction(db, friend.id, 'model_select', modelName || 'モデル選択');
      if (modelName) {
        await setFriendAttribute(db, friend.id, 'repair_model_name', modelName);
      }
      await setContactMark(db, friend.id, 'mark_18');
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex after model select:', err);
      }
      return;
    }

    if (action === 'choose_year_method') {
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildYearSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send year select flex:', err);
      }
      return;
    }

    if (action === 'skip_model') {
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex:', err);
      }
      return;
    }

    if (action === 'select_year') {
      const year = parseInt(params.get('year') ?? '0', 10);
      if (year > 0) {
        await setFriendAttribute(db, friend.id, 'repair_year', String(year));
      }
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildInchSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send inch select flex:', err);
      }
      return;
    }

    if (action === 'select_inch') {
      const inch = params.get('inch') ?? '';
      if (inch) {
        await setFriendAttribute(db, friend.id, 'repair_inch_size', inch);
      }
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      try {
        const symptomFlex = await buildSymptomSelectFlex(db, productId);
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', symptomFlex),
        ]);
      } catch (err) {
        console.error('Failed to send symptom flex after inch:', err);
      }
      return;
    }

    if (action === 'select_symptom') {
      const symptomId = params.get('symptom_id') ?? '';
      const symptomName = params.get('symptom_name') ?? '';
      await logFriendAction(db, friend.id, 'symptom_select', symptomName || '症状選択');
      const productId = (await getFriendAttribute(db, friend.id, 'repair_product_id'))
        ?? 'prod-oth-0001-0000-0000-000000000003';
      const productName = (await getFriendAttribute(db, friend.id, 'repair_product_name')) ?? 'MacBook';
      const modelName = await getFriendAttribute(db, friend.id, 'repair_model_name');
      const yearStr = await getFriendAttribute(db, friend.id, 'repair_year');
      const inchSize = await getFriendAttribute(db, friend.id, 'repair_inch_size');

      await setFriendAttribute(db, friend.id, 'repair_symptom_id', symptomId);
      await setContactMark(db, friend.id, 'mark_21');

      let priceFrom: number | null = null;
      let priceTo: number | null = null;
      let deliveryFrom: number | null = null;
      let deliveryTo: number | null = null;
      let deliveryDays: string | null = null;
      let resolvedModelName: string | null = modelName ?? null;

      if (modelName) {
        // Model number flow: look up by model_number + symptom name
        const row = await getRepairModelPrice(db, modelName, symptomName);
        if (!row) {
          try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: MISSING_MODEL_MESSAGE }]); } catch {}
          return;
        }
        if (row.inquiry_only) {
          try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch {}
          return;
        }
        priceFrom = row.price;
        deliveryDays = row.delivery_days;
      } else if (yearStr && inchSize) {
        // Year+inch flow: MAX price among matching models (NULLS LAST)
        const productType = productName.toLowerCase().includes('air') ? 'air'
          : productName.toLowerCase().includes('pro') ? 'pro' : 'other';
        const inchFloat = parseFloat(inchSize);
        const row = await getRepairPriceByYearInch(db, productType, parseInt(yearStr, 10), inchFloat, symptomName);
        if (!row) {
          try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: MISSING_MODEL_MESSAGE }]); } catch {}
          return;
        }
        if (row.inquiry_only) {
          try { await replyAndLog(db, lineClient, event.replyToken, friend.id, [{ type: 'text', text: CONSULTATION_REQUEST_MESSAGE }]); } catch {}
          return;
        }
        priceFrom = row.price;
        deliveryDays = row.delivery_days;
        resolvedModelName = row.model_number;
      } else {
        // Fallback: use generic repair_prices table
        const price = await getRepairPrice(db, productId, symptomId);
        if (price) {
          priceFrom = price.price_from;
          priceTo = price.price_to;
          deliveryFrom = price.delivery_days_from;
          deliveryTo = price.delivery_days_to;
        }
      }

      try {
        const quote = await createRepairQuote(db, {
          friendId: friend.id,
          productId,
          symptomId,
          modelName: resolvedModelName ?? productName,
          year: yearStr ? parseInt(yearStr, 10) : null,
          priceFrom,
          priceTo,
          deliveryDaysFrom: deliveryFrom,
          deliveryDaysTo: deliveryTo,
        });
        await setFriendAttribute(db, friend.id, 'repair_quote_id', quote.id);
        const symptomImageUrl = getSymptomImageUrl(symptomName);
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          { type: 'image', originalContentUrl: symptomImageUrl, previewImageUrl: symptomImageUrl },
          buildMessage('flex', buildQuoteFlex({
            productName,
            symptomName,
            priceFrom,
            priceTo,
            deliveryFrom,
            deliveryTo,
            deliveryDays,
            quoteId: quote.id,
            modelName: resolvedModelName,
            year: yearStr ? parseInt(yearStr, 10) : null,
            inchSize,
          })),
        ]);
      } catch (err) {
        console.error('Failed to send quote flex:', err);
      }
      return;
    }

    if (action === 'request_type') {
      const type = params.get('type') as 'mail' | 'store' | 'consult' | null;
      const quoteId = params.get('quote_id') ?? '';
      if (type && quoteId) {
        await updateRepairQuoteRequestType(db, quoteId, type);
      }
      await logFriendAction(db, friend.id, 'order_confirm',
        type === 'mail' ? '依頼する（郵送）' : type === 'store' ? '依頼する（来店）' : '依頼しない');
      await setContactMark(db, friend.id, 'mark_22');

      try {
        if (type === 'mail') {
          await setContactMark(db, friend.id, 'mark_23');
          await removeTagsByNames(db, friend.id, ['依頼しない', 'タグなし']);
          await addTagToFriend(db, friend.id, '依頼する');
          await addTagToFriend(db, friend.id, '郵送依頼');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'text', text: '下記ボタンよりお申し込みをよろしくお願い申し上げます！' },
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: {
                type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'button', action: { type: 'uri', label: '郵送修理ご依頼フォーム', uri: MAIL_REPAIR_FORM_URL }, style: 'primary', height: 'sm', color: '#00B900' },
                ],
              },
            })),
          ]);
        } else if (type === 'store') {
          await removeTagsByNames(db, friend.id, ['依頼しない']);
          await addTagToFriend(db, friend.id, '依頼する');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', buildStoreSelectFlex()),
          ]);
        } else {
          await setContactMark(db, friend.id, 'mark_11');
          await removeTagsByNames(db, friend.id, ['依頼する']);
          await addTagToFriend(db, friend.id, '依頼しない');
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', buildConsultCategoryFlex()),
          ]);
        }
      } catch (err) {
        console.error('Failed to reply for request_type:', err);
      }
      return;
    }

    if (action === 'select_store') {
      const storeKey = params.get('store_key') ?? '';

      if (storeKey === 'none') {
        try {
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'text', text: 'ご希望の店舗が見つからない場合は、お気軽にご相談ください。' },
          ]);
        } catch (err) {
          console.error('Failed to reply for no store:', err);
        }
        return;
      }

      const store = STORES.find((s) => s.key === storeKey);
      if (!store) return;

      await logFriendAction(db, friend.id, 'store_select', store.shortName);
      await setFriendAttribute(db, friend.id, 'repair_store', store.shortName);
      await setContactMark(db, friend.id, 'mark_24');

      const storeInfoText =
        `${store.shortName}での店頭修理をご希望ですね！✨\n` +
        `下記店舗情報となります🙇‍♂️\n\n` +
        `${store.name}\n` +
        `住所：\n${store.zip}\n${store.address}\n` +
        `電話番号：${store.tel}\n` +
        `営業時間：${store.hours}\n\n` +
        `ご来店のご予約は下記のボタンからお進みください！`;

      const reservationUrlWithStore = `${STORE_RESERVATION_URL_GENERAL}&storeKey=${storeKey}`;
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          { type: 'text', text: storeInfoText },
          buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
              contents: [
                { type: 'text', text: '来店予約フォーム', weight: 'bold', size: 'lg', color: '#1a1a1a' },
                { type: 'text', text: 'ご希望の日時を選択してご予約ください。', wrap: true, size: 'sm', color: '#555555' },
              ],
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'button', action: { type: 'uri', label: '来店予約をする', uri: reservationUrlWithStore }, style: 'primary', height: 'sm', color: '#06C755' }],
            },
          })),
        ]);
      } catch (err) {
        console.error('Failed to reply for store selection:', err);
      }
      return;
    }

    if (action === 'start_repair') {
      await logFriendAction(db, friend.id, 'menu_repair', '修理依頼をする');
      await setContactMark(db, friend.id, 'mark_17');
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildProductSelectFlex()),
        ]);
      } catch (err) {
        console.error('Failed to send product select flex for start_repair:', err);
      }
      return;
    }

    if (action === 'consult_category') {
      const category = params.get('category') ?? '';
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          buildMessage('flex', buildFaqListFlex(category)),
        ]);
      } catch (err) {
        console.error('Failed to send FAQ list flex:', err);
      }
      return;
    }

    if (action === 'consult_phone') {
      try {
        await replyAndLog(db, lineClient, event.replyToken, friend.id, [
          { type: 'text', text: CONSULT_PHONE_TEXT },
        ]);
      } catch (err) {
        console.error('Failed to send consult phone text:', err);
      }
      return;
    }

    if (action === 'faq_question') {
      const category = params.get('category') ?? '';
      const idx = parseInt(params.get('idx') ?? '0', 10);
      const cat = CONSULT_FAQS[category];
      const faq = cat?.questions[idx];
      if (!faq) return;

      try {
        if (faq.special === 'store_select') {
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', buildStoreSelectFlex()),
          ]);
        } else if (faq.special === 'phone') {
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            { type: 'text', text: CONSULT_PHONE_TEXT },
          ]);
        } else {
          const footerContents: unknown[] = [];
          if (faq.special === 'reservation_button') {
            footerContents.push({
              type: 'button',
              action: { type: 'message', label: '来店予約する', text: '来店予約する' },
              style: 'primary', height: 'sm', color: '#00B900',
            });
          } else if (faq.special === 'privacy_policy') {
            footerContents.push({
              type: 'button',
              action: { type: 'uri', label: '利用規約・プライバシーポリシー', uri: PRIVACY_POLICY_URL },
              style: 'primary', height: 'sm', color: '#00B900',
            });
          }
          const bubble: Record<string, unknown> = {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#1e3a5f',
              contents: [{ type: 'text', text: faq.q, color: '#ffffff', weight: 'bold', size: 'sm', wrap: true }],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [{ type: 'text', text: faq.a, size: 'sm', color: '#333333', wrap: true }],
            },
          };
          if (footerContents.length > 0) {
            bubble.footer = { type: 'box', layout: 'vertical', paddingAll: '16px', contents: footerContents };
          }
          await replyAndLog(db, lineClient, event.replyToken, friend.id, [
            buildMessage('flex', JSON.stringify(bubble)),
          ]);
        }
      } catch (err) {
        console.error('Failed to send FAQ answer flex:', err);
      }
      return;
    }

    return;
  }
}

export { webhook };
