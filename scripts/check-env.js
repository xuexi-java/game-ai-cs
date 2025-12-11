#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ANSI 颜色代码
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

/**
 * 打印彩色消息
 */
function printMessage(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 解析 .env 文件内容
 */
function parseEnvFile(content) {
    const envVars = {};

    // 移除 BOM（Byte Order Mark）
    content = content.replace(/^\uFEFF/, '');

    // 分割行，支持 \r\n 和 \n
    const lines = content.split(/\r?\n/);

    for (let line of lines) {
        // 移除行首尾的空白字符（包括 \r）
        line = line.trim();

        // 跳过空行和注释
        if (!line || line.startsWith('#')) {
            continue;
        }

        // 解析 KEY=VALUE 格式
        const equalIndex = line.indexOf('=');
        if (equalIndex > 0) {
            let key = line.substring(0, equalIndex).trim();
            let value = line.substring(equalIndex + 1).trim();

            // 移除引号（如果有）
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            envVars[key] = value;
        }
    }

    return envVars;
}

/**
 * 掩码显示密钥（显示前3位和后3位）
 */
function maskSecret(secret) {
    if (!secret || secret.length <= 6) {
        return '******';
    }
    const prefix = secret.substring(0, 3);
    const suffix = secret.substring(secret.length - 3);
    const maskLength = secret.length - 6;
    return `${prefix}${'*'.repeat(maskLength)}${suffix}`;
}

/**
 * 主检查函数
 */
function checkEnv() {
    printMessage('\n🔍 开始检查环境变量配置...\n', 'blue');

    const errors = [];
    const warnings = [];

    // 1. 检查 .env 文件是否存在
    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) {
        errors.push('❌ 未找到 .env 文件，请在项目根目录创建 .env 文件');
        printMessage('\n检查结果：', 'red');
        errors.forEach(err => printMessage(err, 'red'));
        process.exit(1);
    }

    printMessage('✓ .env 文件存在', 'green');

    // 2. 读取并解析 .env 文件
    let envContent;
    try {
        envContent = fs.readFileSync(envPath, 'utf-8');
    } catch (error) {
        errors.push(`❌ 无法读取 .env 文件: ${error.message}`);
        printMessage('\n检查结果：', 'red');
        errors.forEach(err => printMessage(err, 'red'));
        process.exit(1);
    }

    const envVars = parseEnvFile(envContent);

    // 3. 检查 BAIDU_TRANSLATE_SECRET
    const secret = envVars['BAIDU_TRANSLATE_SECRET'];

    if (!secret) {
        errors.push('❌ BAIDU_TRANSLATE_SECRET 未设置或为空');
    } else if (secret.includes('*')) {
        errors.push('❌ BAIDU_TRANSLATE_SECRET 包含星号 *，这可能是示例值，请填写真实的密钥');
    } else {
        printMessage('✓ BAIDU_TRANSLATE_SECRET 已设置', 'green');
        printMessage(`  密钥预览: ${maskSecret(secret)}`, 'yellow');
    }

    // 4. 检查 BAIDU_TRANSLATE_APP_ID
    const appId = envVars['BAIDU_TRANSLATE_APP_ID'];

    if (!appId) {
        errors.push('❌ BAIDU_TRANSLATE_APP_ID 未设置或为空');
    } else {
        printMessage('✓ BAIDU_TRANSLATE_APP_ID 已设置', 'green');
        printMessage(`  APP ID: ${appId}`, 'yellow');
    }

    // 5. 输出检查结果
    console.log('');

    if (errors.length > 0) {
        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'red');
        printMessage('检查失败 ❌', 'red');
        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'red');
        console.log('');
        errors.forEach(err => printMessage(err, 'red'));
        console.log('');
        printMessage('请修复以上错误后重新运行检查。', 'red');
        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'red');
        process.exit(1);
    } else {
        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');
        printMessage('检查通过 ✅', 'green');
        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');
        console.log('');
        printMessage('所有环境变量配置正确！', 'green');

        if (warnings.length > 0) {
            console.log('');
            printMessage('⚠️  警告信息：', 'yellow');
            warnings.forEach(warn => printMessage(warn, 'yellow'));
        }

        printMessage('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'green');
        process.exit(0);
    }
}

// 运行检查
checkEnv();
