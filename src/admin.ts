/**
 * admin.ts - 管理面板后端 API
 *
 * 提供配置热更新功能：GET /api/config 读取，POST /api/config 保存并立即生效
 */

import type { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig, updateConfig, saveConfig, reloadConfig } from './config.js';
import type { AppConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

function readPublicFile(filename: string): string {
    return readFileSync(join(publicDir, filename), 'utf-8');
}

// ==================== 页面服务 ====================

export function serveAdmin(_req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(readPublicFile('admin.html'));
}

// ==================== API 路由 ====================

/** GET /api/config - 返回当前完整配置 */
export function apiGetConfig(_req: Request, res: Response): void {
    res.json(getConfig());
}

/**
 * POST /api/config - 接收前端配置对象，热更新内存并持久化到 config.yaml
 *
 * 请求体格式为 AppConfig（camelCase），与 GET /api/config 返回格式一致
 */
export function apiUpdateConfig(req: Request, res: Response): void {
    try {
        const body = req.body as Partial<AppConfig>;

        // 基础校验
        if (body.port !== undefined && (typeof body.port !== 'number' || body.port < 1 || body.port > 65535)) {
            res.status(400).json({ success: false, error: 'port 必须为 1-65535 之间的整数' });
            return;
        }
        if (body.timeout !== undefined && (typeof body.timeout !== 'number' || body.timeout < 1)) {
            res.status(400).json({ success: false, error: 'timeout 必须为正整数（秒）' });
            return;
        }
        if (body.maxAutoContinue !== undefined && typeof body.maxAutoContinue !== 'number') {
            res.status(400).json({ success: false, error: 'maxAutoContinue 必须为数字' });
            return;
        }

        // 热更新内存 config
        updateConfig(body);
        // 持久化到 config.yaml
        saveConfig();

        res.json({ success: true, config: getConfig() });
    } catch (e) {
        console.error('[Admin] 保存配置失败:', e);
        res.status(500).json({ success: false, error: String(e) });
    }
}

/**
 * POST /api/config/reload - 从 config.yaml 重新加载配置（覆盖内存）
 * 用于用户手动编辑文件后刷新，无需重启服务
 */
export function apiReloadConfig(_req: Request, res: Response): void {
    try {
        const newConfig = reloadConfig();
        res.json({ success: true, config: newConfig });
    } catch (e) {
        console.error('[Admin] 重载配置失败:', e);
        res.status(500).json({ success: false, error: String(e) });
    }
}
