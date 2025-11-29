const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const APP_ID = process.env.APP_ID;
const HMAC_KEY = process.env.HMAC_KEY;

if (!WEBHOOK_URL || !APP_ID) {
    console.error('Error: Missing required environment variables (WEBHOOK_URL, APP_ID).');
    process.exit(1);
}

const WEVERSE_BASE_URL = "https://global.apis.naver.com/weverse/wevweb";

const STATE_FILE = path.join(__dirname, 'state.json');

// Headers to mimic browser
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://weverse.io/',
    'Origin': 'https://weverse.io',
    'WEV-device-Id': '1',
    'WEV-wdm-v2': 'off',
    'WEV-open-community': 'A',
    'WEV-timezone-id': 'Asia/Seoul'
};

function generateWeverseURL(targetPath, queryParams) {
    if (!targetPath.endsWith('?')) {
        targetPath += '?';
    }
    
    const wmsgpad = Date.now().toString();
    
    // Sort keys alphabetically to match Go's url.Values.Encode()
    const sortedKeys = Object.keys(queryParams).sort();
    const params = new URLSearchParams();
    sortedKeys.forEach(key => {
        params.append(key, queryParams[key]);
    });
    
    const encodedParams = params.toString();
    let apiPath = targetPath + encodedParams;
    
    // Truncate to 255 characters (Go does bytes, but for ASCII params this is equivalent)
    if (apiPath.length > 255) {
        apiPath = apiPath.substring(0, 255);
    }
    
    const hmac = crypto.createHmac('sha1', HMAC_KEY);
    hmac.update(apiPath + wmsgpad);
    const wmd = hmac.digest('base64');
    
    return `${WEVERSE_BASE_URL}${targetPath}${encodedParams}&wmsgpad=${wmsgpad}&wmd=${encodeURIComponent(wmd)}`;
}

async function fetchNotices() {
    // Note: targetPath should NOT include the base URL
    const targetPath = "/community/v1.0/community-240/NOTICE/tabContent?";
    const params = {
        "appId": APP_ID,
        "fields": "notices.fieldSet(noticesV1).limit(10).pageNo(1)",
        "language": "ko",
        "os": "WEB",
        "pagingType": "PAGE_NO",
        "platform": "WEB",
        "wpf": "pc"
    };
    
    const url = generateWeverseURL(targetPath, params);

    try {
        const response = await axios.get(url, { headers: HEADERS });
        if (response.data && response.data.content && response.data.content.notices && response.data.content.notices.data) {
            return response.data.content.notices.data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching notices list:', error.message);
        return [];
    }
}

async function fetchNoticeDetail(noticeId) {
    const targetPath = `/notice/v1.0/notice-${noticeId}?`;
    const params = {
        "appId": APP_ID,
        "fieldSet": "noticeV1",
        "language": "ko",
        "os": "WEB",
        "platform": "WEB",
        "wpf": "pc"
    };
    
    const url = generateWeverseURL(targetPath, params);

    try {
        const response = await axios.get(url, { headers: HEADERS });
        return response.data;
    } catch (error) {
        console.error(`Error fetching notice detail for ${noticeId}:`, error.message);
        return null;
    }
}

async function sendWebhook(noticeDetail) {
    const embeds = [];
    const mainEmbed = {
        title: noticeDetail.title,
        description: noticeDetail.plainBody ? noticeDetail.plainBody.substring(0, 500) + (noticeDetail.plainBody.length > 500 ? '...' : '') : 'No content',
        url: noticeDetail.shareUrl || `https://weverse.io/`,
        timestamp: new Date(noticeDetail.publishAt).toISOString(),
        color: 0x8daace // User specified #8daace
    };

    // Handle Images
    const photos = [];
    if (noticeDetail.attachment && noticeDetail.attachment.photo) {
        for (const key in noticeDetail.attachment.photo) {
            photos.push(noticeDetail.attachment.photo[key].url);
        }
    }

    if (photos.length > 0) {
        mainEmbed.image = { url: photos[0] };
    }

    embeds.push(mainEmbed);

    // Add additional images as separate embeds (Discord trick for gallery view)
    for (let i = 1; i < photos.length; i++) {
        if (i >= 4) break; // Limit to 4 images total to avoid spamming too much
        embeds.push({
            url: noticeDetail.shareUrl,
            image: { url: photos[i] }
        });
    }

    try {
        await axios.post(WEBHOOK_URL, {
            content: `Weverse Notice: ${noticeDetail.title} @everyone`,
            embeds: embeds
        });
        console.log('Webhook sent for notice:', noticeDetail.noticeId);
    } catch (error) {
        console.error('Error sending webhook:', error.message);
    }
}

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch (e) {
            console.error('Error reading state file:', e);
        }
    }
    return { lastNoticeId: 0 };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function run() {
    console.log('Starting Weverse Notice Check...');
    const state = loadState();
    const notices = await fetchNotices();

    if (notices.length === 0) {
        console.log('No notices found.');
        return;
    }

    // Sort notices by ID ascending (oldest to newest) to process correctly
    notices.sort((a, b) => a.noticeId - b.noticeId);

    const latestNoticeId = notices[notices.length - 1].noticeId;

    if (state.lastNoticeId === 0) {
        // First run: just save the latest ID to avoid spamming
        console.log(`First run. Initializing with latest notice ID: ${latestNoticeId}`);
        state.lastNoticeId = latestNoticeId;
        saveState(state);
        return;
    }

    let newNoticesFound = false;
    for (const notice of notices) {
        if (notice.noticeId > state.lastNoticeId) {
            console.log('New notice found:', notice.noticeId);
            
            // Fetch details
            const detail = await fetchNoticeDetail(notice.noticeId);
            if (detail) {
                await sendWebhook(detail);
            } else {
                // Fallback
                await sendWebhook({
                    title: notice.title,
                    plainBody: notice.body,
                    shareUrl: notice.shareUrl,
                    publishAt: notice.publishAt,
                    noticeId: notice.noticeId
                });
            }
            
            // Update state immediately in case of crash/error later
            state.lastNoticeId = notice.noticeId;
            newNoticesFound = true;
        }
    }

    if (newNoticesFound) {
        saveState(state);
        console.log(`State updated. Last notice ID: ${state.lastNoticeId}`);
    } else {
        console.log('No new notices.');
    }
}

run();
