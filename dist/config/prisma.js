"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("./env");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: env_1.config.isDev ? ['query', 'error', 'warn'] : ['error'],
    });
if (env_1.config.isDev)
    globalForPrisma.prisma = exports.prisma;
