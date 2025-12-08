const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URLSearchParams } = require('url');

async function main() {
    console.log('Starting translation test...');

    // 1. Load Environment Variables
    const envPath = path.join(__dirname, '../backend/.env');
    let appId = process.env.BAIDU_TRANSLATE_APP_ID;
    let secret = process.env.BAIDU_TRANSLATE_SECRET;

    if (!appId || !secret) {
        console.log(`Checking env file at: ${envPath}`);
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            for (const line of lines) {
                // Simple parsing for key=value
                const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
                if (match) {
                    const key = match[1];
                    let value = match[2] || '';
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (key === 'BAIDU_TRANSLATE_APP_ID') appId = value;
                    if (key === 'BAIDU_TRANSLATE_SECRET') secret = value;
                }
            }
        } else {
            console.warn('Warning: backend/.env file not found.');
            // Try root .env as fallback
            const rootEnvPath = path.join(__dirname, '../.env');
            if (fs.existsSync(rootEnvPath)) {
                console.log(`Checking root env file at: ${rootEnvPath}`);
                const envContent = fs.readFileSync(rootEnvPath, 'utf8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
                    if (match) {
                        const key = match[1];
                        let value = match[2] || '';
                        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        if (!appId && key === 'BAIDU_TRANSLATE_APP_ID') appId = value;
                        if (!secret && key === 'BAIDU_TRANSLATE_SECRET') secret = value;
                    }
                }
            }
        }
    }

    if (!appId || !secret) {
        console.error('Error: Missing BAIDU_TRANSLATE_APP_ID or BAIDU_TRANSLATE_SECRET.');
        console.error('Please ensure they are set in backend/.env or passed as environment variables.');
        process.exit(1);
    }

    console.log(`Using App ID: ${appId.slice(0, 3)}***${appId.slice(-3)}`);

    // 2. Prepare Request
    const query = '你好，世界';
    const from = 'auto'; // or 'zh'
    const to = 'en';
    const salt = Date.now().toString();
    const signStr = appId + query + salt + secret;
    const sign = crypto.createHash('md5').update(signStr).digest('hex');

    const apiUrl = 'http://api.fanyi.baidu.com/api/trans/vip/translate';

    const params = new URLSearchParams({
        q: query,
        from: from,
        to: to,
        appid: appId,
        salt: salt,
        sign: sign
    });

    const url = `${apiUrl}?${params.toString()}`;

    console.log(`Sending request to Baidu Translate API...`);
    console.log(`Query: "${query}"`);

    // 3. Send Request
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error_code) {
            console.error('API Error:', data);
            console.error(`Error Code: ${data.error_code}`);
            console.error(`Error Msg: ${data.error_msg}`);

            if (data.error_code === '58000') {
                console.error('\n[Fix Guide]: Validation failed due to IP restrictions.');
                console.error(`Please add your current IP [${data.data?.client_ip || 'unknown'}] to the whitelist in Baidu Developer Console.`);
                console.error('Or use an App ID that does not have IP restrictions.');
            }
        } else {
            console.log('Translation Success!');
            console.log('Result:', JSON.stringify(data, null, 2));

            if (data.trans_result && data.trans_result.length > 0) {
                console.log(`\nOriginal: ${query}`);
                console.log(`Translated: ${data.trans_result[0].dst}`);
            }
        }
    } catch (error) {
        console.error('Network or Script Error:', error);
    }
}

main();
