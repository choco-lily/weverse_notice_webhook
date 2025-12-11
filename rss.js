require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_ID = process.env.APP_ID;
const HMAC_KEY = process.env.HMAC_KEY;
const COMMUNITY_ID = process.env.COMMUNITY_ID || '240';
const TAB_KEY = process.env.TAB_KEY || 'NOTICE';
const LIMIT = parseInt(process.env.RSS_LIMIT || '20', 10);

if (!APP_ID || !HMAC_KEY) {
  console.error('APP_ID와 HMAC_KEY 환경변수가 필요합니다. .env를 확인하세요.');
  process.exit(1);
}

const WEVERSE_BASE_URL = 'https://global.apis.naver.com/weverse/wevweb';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://weverse.io/',
  Origin: 'https://weverse.io',
  'WEV-device-Id': '1',
  'WEV-wdm-v2': 'off',
  'WEV-open-community': 'A',
  'WEV-timezone-id': 'Asia/Seoul',
};

function generateWeverseURL(targetPath, queryParams) {
  if (!targetPath.endsWith('?')) {
    targetPath += '?';
  }

  const wmsgpad = Date.now().toString();
  const sortedKeys = Object.keys(queryParams).sort();
  const params = new URLSearchParams();
  sortedKeys.forEach((key) => {
    params.append(key, queryParams[key]);
  });

  const encodedParams = params.toString();
  let apiPath = targetPath + encodedParams;
  if (apiPath.length > 255) {
    apiPath = apiPath.substring(0, 255);
  }

  const hmac = crypto.createHmac('sha1', HMAC_KEY);
  hmac.update(apiPath + wmsgpad);
  const wmd = hmac.digest('base64');

  return `${WEVERSE_BASE_URL}${targetPath}${encodedParams}&wmsgpad=${wmsgpad}&wmd=${encodeURIComponent(wmd)}`;
}

async function fetchNotices() {
  const targetPath = `/community/v1.0/community-${COMMUNITY_ID}/${TAB_KEY}/tabContent?`;
  const params = {
    appId: APP_ID,
    fields: `notices.fieldSet(noticesV1).limit(${LIMIT}).pageNo(1)`,
    language: 'ko',
    os: 'WEB',
    pagingType: 'PAGE_NO',
    platform: 'WEB',
    wpf: 'pc',
  };

  const url = generateWeverseURL(targetPath, params);
  const { data } = await axios.get(url, { headers: HEADERS });
  return data?.content?.notices?.data ?? [];
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRSS(notices) {
  const items = notices
    .map((n) => {
      const pubDate = new Date(n.publishAt).toUTCString();
      const link = n.shareUrl || `https://weverse.io/notice/${n.noticeId}`;
      const description = escapeHtml(n.body || n.title || '');
      const guid = `weverse-${COMMUNITY_ID}-${n.noticeId}`;
      return `
    <item>
      <title>${escapeHtml(n.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
    })
    .join('\n');

  const now = new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Weverse Notices - Community ${COMMUNITY_ID}</title>
    <link>https://weverse.io/community/${COMMUNITY_ID}</link>
    <description>최근 Weverse 공지사항 RSS</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

async function main() {
  try {
    console.log(`RSS 생성: community=${COMMUNITY_ID}, tab=${TAB_KEY}, limit=${LIMIT}`);
    const notices = await fetchNotices();
    if (!Array.isArray(notices) || notices.length === 0) {
      console.warn('공지사항을 가져오지 못했습니다.');
      return;
    }

    const rss = buildRSS(notices);
    const outDir = path.join(__dirname, 'public');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outPath = path.join(outDir, 'rss.xml');
    fs.writeFileSync(outPath, rss, 'utf8');
    console.log(`✅ RSS 생성 완료: ${outPath}`);
  } catch (err) {
    console.error('RSS 생성 중 오류:', err.message);
    process.exitCode = 1;
  }
}

main();

