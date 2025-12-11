/**
 * 修复 .env 文件配置脚本
 * 自动添加或更新百度翻译 API 配置
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// 正确的配置值
const CORRECT_APP_ID = '20250311002299702';
const CORRECT_SECRET = 'H1dETwWWqk45uN2DzGxK';

console.log('=== 修复 .env 文件配置 ===\n');

let envContent = '';

// 如果 .env 文件存在，读取内容
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ 找到 .env 文件');
} else {
    console.log('⚠️  .env 文件不存在，将创建新文件');
}

// 按行分割
const lines = envContent.split('\n');
const newLines = [];
let hasAppId = false;
let hasSecret = false;
let appIdLineIndex = -1;
let secretLineIndex = -1;

// 检查现有配置
lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('BAIDU_TRANSLATE_APP_ID=')) {
        hasAppId = true;
        appIdLineIndex = index;
        // 检查值是否正确
        const currentValue = trimmedLine.substring('BAIDU_TRANSLATE_APP_ID='.length).trim();
        if (currentValue !== CORRECT_APP_ID) {
            console.log(`⚠️  发现 BAIDU_TRANSLATE_APP_ID，但值不正确: "${currentValue}"`);
            console.log(`   将更新为: "${CORRECT_APP_ID}"`);
            newLines.push(`BAIDU_TRANSLATE_APP_ID=${CORRECT_APP_ID}`);
        } else {
            console.log(`✅ BAIDU_TRANSLATE_APP_ID 配置正确`);
            newLines.push(line);
        }
    } else if (trimmedLine.startsWith('BAIDU_TRANSLATE_SECRET=')) {
        hasSecret = true;
        secretLineIndex = index;
        // 检查值是否正确
        const currentValue = trimmedLine.substring('BAIDU_TRANSLATE_SECRET='.length).trim();
        // 去除可能的引号
        const cleanValue = currentValue.replace(/^["']|["']$/g, '');
        if (cleanValue !== CORRECT_SECRET) {
            console.log(`⚠️  发现 BAIDU_TRANSLATE_SECRET，但值不正确`);
            console.log(`   当前长度: ${cleanValue.length}, 正确长度: ${CORRECT_SECRET.length}`);
            console.log(`   将更新为正确的 Secret`);
            newLines.push(`BAIDU_TRANSLATE_SECRET=${CORRECT_SECRET}`);
        } else {
            console.log(`✅ BAIDU_TRANSLATE_SECRET 配置正确`);
            newLines.push(`BAIDU_TRANSLATE_SECRET=${CORRECT_SECRET}`);
        }
    } else {
        // 保留其他行
        newLines.push(line);
    }
});

// 如果没有找到配置，添加到文件末尾
if (!hasAppId) {
    console.log('⚠️  未找到 BAIDU_TRANSLATE_APP_ID，将添加');
    newLines.push('');
    newLines.push('# 百度翻译 API 配置');
    newLines.push(`BAIDU_TRANSLATE_APP_ID=${CORRECT_APP_ID}`);
}

if (!hasSecret) {
    console.log('⚠️  未找到 BAIDU_TRANSLATE_SECRET，将添加');
    if (!hasAppId) {
        // 如果 APP_ID 也没找到，已经在上面添加了注释
    } else {
        newLines.push('');
        newLines.push('# 百度翻译 API 配置');
    }
    newLines.push(`BAIDU_TRANSLATE_SECRET=${CORRECT_SECRET}`);
}

// 写入文件
const newContent = newLines.join('\n');
fs.writeFileSync(envPath, newContent, 'utf8');

console.log('\n✅ .env 文件已更新！');
console.log('\n配置内容:');
console.log(`BAIDU_TRANSLATE_APP_ID=${CORRECT_APP_ID}`);
console.log(`BAIDU_TRANSLATE_SECRET=${CORRECT_SECRET}`);
console.log('\n⚠️  重要提示:');
console.log('   1. 请重启后端服务以使配置生效');
console.log('   2. 确保 Secret 值前后没有空格或隐藏字符');
console.log('   3. 不要使用引号包裹值');
