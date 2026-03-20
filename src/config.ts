import { readFileSync, writeFileSync, existsSync, copyFileSync, watch } from 'fs';
import type { FSWatcher } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AppConfig } from './types.js';

let config: AppConfig | null = null;
let configWatcher: FSWatcher | null = null;

/** 从默认值、config.yaml、环境变量三层加载配置，返回新 config 对象 */
function loadConfigFromSources(): AppConfig {
    // 默认配置
    const c: AppConfig = {
        port: 3010,
        timeout: 120,
        cursorModel: 'anthropic/claude-sonnet-4.6',
        maxAutoContinue: 0,
        maxHistoryMessages: -1,
        sanitizeEnabled: false,
        fingerprint: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
    };

    // 从 config.yaml 加载
    if (existsSync('config.yaml')) {
        try {
            const raw = readFileSync('config.yaml', 'utf-8');
            const yaml = parseYaml(raw);
            if (yaml.port) c.port = yaml.port;
            if (yaml.timeout) c.timeout = yaml.timeout;
            if (yaml.proxy) c.proxy = yaml.proxy;
            if (yaml.cursor_model) c.cursorModel = yaml.cursor_model;
            if (typeof yaml.max_auto_continue === 'number') c.maxAutoContinue = yaml.max_auto_continue;
            if (typeof yaml.max_history_messages === 'number') c.maxHistoryMessages = yaml.max_history_messages;
            if (yaml.fingerprint) {
                if (yaml.fingerprint.user_agent) c.fingerprint.userAgent = yaml.fingerprint.user_agent;
            }
            if (yaml.vision) {
                c.vision = {
                    enabled: yaml.vision.enabled !== false,
                    mode: yaml.vision.mode || 'ocr',
                    baseUrl: yaml.vision.base_url || 'https://api.openai.com/v1/chat/completions',
                    apiKey: yaml.vision.api_key || '',
                    model: yaml.vision.model || 'gpt-4o-mini',
                    proxy: yaml.vision.proxy || undefined,
                };
            }
            if (typeof yaml.sanitize_enabled === 'boolean') c.sanitizeEnabled = yaml.sanitize_enabled;
            if (Array.isArray(yaml.refusal_patterns)) c.refusalPatterns = yaml.refusal_patterns.map(String);
            // ★ API 鉴权 token
            if (yaml.auth_tokens) {
                c.authTokens = Array.isArray(yaml.auth_tokens)
                    ? yaml.auth_tokens.map(String)
                    : String(yaml.auth_tokens).split(',').map((s: string) => s.trim()).filter(Boolean);
            }
            // ★ 历史压缩配置
            if (yaml.compression !== undefined) {
                const comp = yaml.compression;
                c.compression = {
                    enabled: comp.enabled !== false,
                    level: [1, 2, 3].includes(comp.level) ? comp.level : 1,
                    keepRecent: typeof comp.keep_recent === 'number' ? comp.keep_recent : 10,
                    earlyMsgMaxChars: typeof comp.early_msg_max_chars === 'number' ? comp.early_msg_max_chars : 4000,
                };
            }
            // ★ Thinking 开关（最高优先级）
            if (yaml.thinking !== undefined) {
                c.thinking = {
                    enabled: yaml.thinking.enabled !== false,
                };
            }
            // ★ 日志文件持久化
            if (yaml.logging !== undefined) {
                c.logging = {
                    file_enabled: yaml.logging.file_enabled === true,
                    dir: yaml.logging.dir || './logs',
                    max_days: typeof yaml.logging.max_days === 'number' ? yaml.logging.max_days : 7,
                };
            }
            // ★ 工具处理配置
            if (yaml.tools !== undefined) {
                const t = yaml.tools;
                const validModes = ['compact', 'full', 'names_only'];
                c.tools = {
                    schemaMode: validModes.includes(t.schema_mode) ? t.schema_mode : 'full',
                    descriptionMaxLength: typeof t.description_max_length === 'number' ? t.description_max_length : 0,
                    includeOnly: Array.isArray(t.include_only) ? t.include_only.map(String) : undefined,
                    exclude: Array.isArray(t.exclude) ? t.exclude.map(String) : undefined,
                };
            }
        } catch (e) {
            console.warn('[Config] 读取 config.yaml 失败:', e);
        }
    }

    // 环境变量覆盖（最高优先级）
    if (process.env.PORT) c.port = parseInt(process.env.PORT);
    if (process.env.TIMEOUT) c.timeout = parseInt(process.env.TIMEOUT);
    if (process.env.PROXY) c.proxy = process.env.PROXY;
    if (process.env.CURSOR_MODEL) c.cursorModel = process.env.CURSOR_MODEL;
    if (process.env.MAX_AUTO_CONTINUE !== undefined) c.maxAutoContinue = parseInt(process.env.MAX_AUTO_CONTINUE);
    if (process.env.MAX_HISTORY_MESSAGES !== undefined) c.maxHistoryMessages = parseInt(process.env.MAX_HISTORY_MESSAGES);
    if (process.env.AUTH_TOKEN) {
        c.authTokens = process.env.AUTH_TOKEN.split(',').map(s => s.trim()).filter(Boolean);
    }
    // 压缩环境变量覆盖
    if (process.env.COMPRESSION_ENABLED !== undefined) {
        if (!c.compression) c.compression = { enabled: false, level: 1, keepRecent: 10, earlyMsgMaxChars: 4000 };
        c.compression.enabled = process.env.COMPRESSION_ENABLED !== 'false' && process.env.COMPRESSION_ENABLED !== '0';
    }
    if (process.env.COMPRESSION_LEVEL) {
        if (!c.compression) c.compression = { enabled: false, level: 1, keepRecent: 10, earlyMsgMaxChars: 4000 };
        const lvl = parseInt(process.env.COMPRESSION_LEVEL);
        if (lvl >= 1 && lvl <= 3) c.compression.level = lvl as 1 | 2 | 3;
    }
    // Thinking 环境变量覆盖
    if (process.env.THINKING_ENABLED !== undefined) {
        c.thinking = {
            enabled: process.env.THINKING_ENABLED !== 'false' && process.env.THINKING_ENABLED !== '0',
        };
    }
    // Logging 环境变量覆盖
    if (process.env.LOG_FILE_ENABLED !== undefined) {
        if (!c.logging) c.logging = { file_enabled: false, dir: './logs', max_days: 7 };
        c.logging.file_enabled = process.env.LOG_FILE_ENABLED === 'true' || process.env.LOG_FILE_ENABLED === '1';
    }
    if (process.env.LOG_DIR) {
        if (!c.logging) c.logging = { file_enabled: false, dir: './logs', max_days: 7 };
        c.logging.dir = process.env.LOG_DIR;
    }
    // 从 base64 FP 环境变量解析指纹
    if (process.env.FP) {
        try {
            const fp = JSON.parse(Buffer.from(process.env.FP, 'base64').toString());
            if (fp.userAgent) c.fingerprint.userAgent = fp.userAgent;
        } catch (e) {
            console.warn('[Config] 解析 FP 环境变量失败:', e);
        }
    }

    return c;
}

/** 获取当前配置（懒加载，首次调用时从文件+环境变量加载） */
export function getConfig(): AppConfig {
    if (!config) config = loadConfigFromSources();
    return config;
}

/**
 * 热更新：将 patch 合并到内存 config，立即生效，无需重启
 * - null 值表示「清除该字段」（删除该 key，回退到默认/无）
 * - 嵌套对象（compression/tools/vision/logging/thinking）会整体替换
 */
export function updateConfig(patch: Record<string, unknown>): AppConfig {
    const current = getConfig();
    const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
    for (const [key, val] of Object.entries(patch)) {
        if (val === null || val === undefined) {
            delete merged[key];
        } else {
            merged[key] = val;
        }
    }
    config = merged as unknown as AppConfig;
    console.log('[Config] 配置已热更新');
    return config;
}

/**
 * 将当前内存 config 序列化为 YAML 写回 config.yaml
 * 写入前先备份为 config.yaml.bak
 */
export function saveConfig(): void {
    const c = getConfig();
    // 备份原文件
    if (existsSync('config.yaml')) {
        try { copyFileSync('config.yaml', 'config.yaml.bak'); } catch { /* ignore */ }
    }
    // 将 AppConfig（camelCase）转换为 yaml 字段格式（snake_case）
    const yamlObj: Record<string, unknown> = {
        port: c.port,
        timeout: c.timeout,
        cursor_model: c.cursorModel,
        max_auto_continue: c.maxAutoContinue,
        max_history_messages: c.maxHistoryMessages,
    };
    if (c.proxy) yamlObj.proxy = c.proxy;
    if (c.authTokens?.length) yamlObj.auth_tokens = c.authTokens;
    yamlObj.fingerprint = { user_agent: c.fingerprint.userAgent };
    if (c.thinking !== undefined) {
        yamlObj.thinking = { enabled: c.thinking.enabled };
    }
    if (c.compression !== undefined) {
        yamlObj.compression = {
            enabled: c.compression.enabled,
            level: c.compression.level,
            keep_recent: c.compression.keepRecent,
            early_msg_max_chars: c.compression.earlyMsgMaxChars,
        };
    }
    if (c.tools !== undefined) {
        const t: Record<string, unknown> = {
            schema_mode: c.tools.schemaMode,
            description_max_length: c.tools.descriptionMaxLength,
        };
        if (c.tools.includeOnly?.length) t.include_only = c.tools.includeOnly;
        if (c.tools.exclude?.length) t.exclude = c.tools.exclude;
        if (c.tools.passthrough) t.passthrough = c.tools.passthrough;
        if (c.tools.disabled) t.disabled = c.tools.disabled;
        yamlObj.tools = t;
    }
    if (c.vision !== undefined) {
        const v: Record<string, unknown> = {
            enabled: c.vision.enabled,
            mode: c.vision.mode,
            base_url: c.vision.baseUrl,
            api_key: c.vision.apiKey,
            model: c.vision.model,
        };
        if (c.vision.proxy) v.proxy = c.vision.proxy;
        yamlObj.vision = v;
    }
    if (c.logging !== undefined) {
        yamlObj.logging = {
            file_enabled: c.logging.file_enabled,
            dir: c.logging.dir,
            max_days: c.logging.max_days,
        };
    }
    if (c.sanitizeEnabled) yamlObj.sanitize_enabled = c.sanitizeEnabled;
    if (c.refusalPatterns?.length) yamlObj.refusal_patterns = c.refusalPatterns;
    writeFileSync('config.yaml', stringifyYaml(yamlObj), 'utf-8');
    console.log('[Config] 配置已保存到 config.yaml');
}

/**
 * 从文件重新加载配置（覆盖内存，用于手动修改文件后刷新）
 * 注意：环境变量覆盖仍会生效
 */
export function reloadConfig(): AppConfig {
    config = null;
    const newConfig = getConfig();
    console.log('[Config] 配置已从文件重新加载');
    return newConfig;
}

/**
 * 启动 config.yaml 文件监听，文件变化时自动热重载
 */
export function initConfigWatcher(): void {
    if (configWatcher) return; // 已启动
    if (!existsSync('config.yaml')) return;
    try {
        configWatcher = watch('config.yaml', () => {
            console.log('[Config] 检测到 config.yaml 变化，自动重载配置...');
            reloadConfig();
        });
        console.log('[Config] 已启动 config.yaml 文件监听');
    } catch (e) {
        console.warn('[Config] 启动文件监听失败:', e);
    }
}

/**
 * 停止 config.yaml 文件监听（优雅关闭时调用）
 */
export function stopConfigWatcher(): void {
    if (configWatcher) {
        configWatcher.close();
        configWatcher = null;
        console.log('[Config] 已停止 config.yaml 文件监听');
    }
}
