"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = exports.SettingsController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
class SettingsController {
    async getPublicSettings(req, res) {
        const settings = await prisma_1.prisma.setting.findMany({
            where: { group: { in: ['general', 'homepage', 'seo', 'social', 'contact', 'shipping'] } },
        });
        const map = settings.reduce((acc, s) => {
            acc[s.key] = s.value || '';
            return acc;
        }, {});
        return (0, response_1.sendSuccess)(res, map, 'Settings fetched');
    }
    async getByGroup(req, res) {
        const { group } = req.params;
        const settings = await prisma_1.prisma.setting.findMany({ where: { group } });
        return (0, response_1.sendSuccess)(res, settings, 'Settings fetched');
    }
    async getAllSettings(req, res) {
        const settings = await prisma_1.prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
        return (0, response_1.sendSuccess)(res, settings, 'All settings');
    }
    async upsertSetting(req, res) {
        const { key, value, group, type, label } = req.body;
        const setting = await prisma_1.prisma.setting.upsert({
            where: { key },
            create: { key, value, group, type, label },
            update: { value },
        });
        return (0, response_1.sendSuccess)(res, setting, 'Setting saved');
    }
    async upsertBulk(req, res) {
        const { settings } = req.body;
        await Promise.all(settings.map((s) => prisma_1.prisma.setting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
        })));
        return (0, response_1.sendSuccess)(res, null, 'Settings saved');
    }
}
exports.SettingsController = SettingsController;
exports.settingsController = new SettingsController();
