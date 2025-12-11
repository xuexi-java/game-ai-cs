/**
 * 检查环境变量配置脚本
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

console.log('=== 环境变量配置检查 ===\n');

// 检查 .env 文件是否存在
if (!fs.existsSync(envPath)) {
    console.log('❌ .env 文件不存在！');
    console.log('   请创建 .env 文件并配置环境变量\n');
    process.exit(1);
}

// 读取 .env 文件内容
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

// 查找 BAIDU_TRANSLATE 相关配置
const baiduConfig = {
    APP_ID: null,
    SECRET: null
};

lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
    }
    
    // 检查 BAIDU_TRANSLATE_APP_ID
    if (trimmedLine.startsWith('BAIDU_TRANSLATE_APP_ID=')) {
        const value = trimmedLine.substring('BAIDU_TRANSLATE_APP_ID='.length).trim();
        baiduConfig.APP_ID = value;
        console.log(`✅ 找到 BAIDU_TRANSLATE_APP_ID (第 ${index + 1} 行)`);
        console.log(`   值: "${value}" (长度: ${value.length})`);
        
        // 检查是否有引号
        if (value.startsWith('"') || value.startsWith("'")) {
            console.log(`   ⚠️  警告: 值包含引号，这可能导致问题！`);
        }
        // 检查是否有空格
        if (value.includes(' ') && !value.startsWith('"') && !value.startsWith("'")) {
            console.log(`   ⚠️  警告: 值包含空格，这可能导致问题！`);
        }
    }
    
    // 检查 BAIDU_TRANSLATE_SECRET
    if (trimmedLine.startsWith('BAIDU_TRANSLATE_SECRET=')) {
        const value = trimmedLine.substring('BAIDU_TRANSLATE_SECRET='.length).trim();
        baiduConfig.SECRET = value;
        console.log(`✅ 找到 BAIDU_TRANSLATE_SECRET (第 ${index + 1} 行)`);
        console.log(`   值: "${'*'.repeat(value.length)}" (长度: ${value.length})`);
        
        // 🚨 检测星号字符串（严重错误）
        if (/^\*+$/.test(value)) {
            console.log(`   ❌ 严重错误: Secret 值是星号字符串！`);
            console.log(`   这是占位符，不是真实的密钥！`);
            console.log(`   💡 请立即修复: 将 "${value}" 改为 "H1dETwWWqk45uN2DzGxK"`);
            console.log(`   然后重启后端服务`);
        }
        
        // 检查长度
        if (value.length !== 20) {
            console.log(`   ⚠️  警告: Secret 长度应为 20，当前为 ${value.length}`);
        } else {
            console.log(`   ✅ Secret 长度正确 (20)`);
        }
        
        // 检查格式
        if (!/^[a-zA-Z0-9]+$/.test(value)) {
            console.log(`   ⚠️  警告: Secret 包含非字母数字字符！`);
            const invalidChars = value.split('').filter(c => !/^[a-zA-Z0-9]$/.test(c));
            console.log(`   无效字符: ${invalidChars.map(c => `'${c}' (code: ${c.charCodeAt(0)})`).join(', ')}`);
        } else {
            console.log(`   ✅ Secret 格式正确 (只包含字母和数字)`);
        }
        
        // 检查是否有引号
        if (value.startsWith('"') || value.startsWith("'")) {
            console.log(`   ⚠️  警告: 值包含引号，这可能导致问题！`);
        }
        // 检查是否有空格
        if (value.includes(' ') && !value.startsWith('"') && !value.startsWith("'")) {
            console.log(`   ⚠️  警告: 值包含空格，这可能导致问题！`);
        }
        
        // 显示前3个和后3个字符用于验证
        if (value.length >= 6) {
            const preview = `${value.substring(0, 3)}...${value.substring(value.length - 3)}`;
            console.log(`   预览: "${preview}"`);
            
            // 验证 Secret 值是否正确
            const expectedStart = 'H1d';
            const expectedEnd = 'GxK';
            const actualStart = value.substring(0, 3);
            const actualEnd = value.substring(value.length - 3);
            if (actualStart === expectedStart && actualEnd === expectedEnd) {
                console.log(`   ✅ Secret 值验证通过 (前缀和后缀匹配)`);
            } else {
                console.log(`   ⚠️  警告: Secret 值可能不正确`);
                console.log(`   期望前缀: "${expectedStart}", 实际: "${actualStart}"`);
                console.log(`   期望后缀: "${expectedEnd}", 实际: "${actualEnd}"`);
            }
        } else {
            console.log(`   预览: "${value}"`);
        }
    }
});

console.log('');

// 检查配置是否完整
if (!baiduConfig.APP_ID) {
    console.log('❌ 未找到 BAIDU_TRANSLATE_APP_ID');
    console.log('   请在 .env 文件中添加: BAIDU_TRANSLATE_APP_ID=20250311002299702\n');
}

if (!baiduConfig.SECRET) {
    console.log('❌ 未找到 BAIDU_TRANSLATE_SECRET');
    console.log('   请在 .env 文件中添加: BAIDU_TRANSLATE_SECRET=H1dETwWWqk45uN2DzGxK\n');
}

if (baiduConfig.APP_ID && baiduConfig.SECRET) {
    console.log('✅ 配置检查完成！');
    console.log('');
    console.log('建议的配置格式:');
    console.log('BAIDU_TRANSLATE_APP_ID=20250311002299702');
    console.log('BAIDU_TRANSLATE_SECRET=H1dETwWWqk45uN2DzGxK');
    console.log('');
    console.log('⚠️  重要提示:');
    console.log('   1. 不要使用引号包裹值');
    console.log('   2. 等号前后不要有空格');
    console.log('   3. Secret 值前后不要有空格或隐藏字符');
    console.log('   4. 修改 .env 文件后需要重启后端服务');
} else {
    console.log('❌ 配置不完整，请检查 .env 文件');
    process.exit(1);
}
