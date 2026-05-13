"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ContactService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let ContactService = ContactService_1 = class ContactService {
    config;
    logger = new common_1.Logger(ContactService_1.name);
    constructor(config) {
        this.config = config;
    }
    async send(dto) {
        const host = this.config.get('SMTP_HOST');
        const port = this.config.get('SMTP_PORT', 587);
        const user = this.config.get('SMTP_USER');
        const pass = this.config.get('SMTP_PASS');
        const to = this.config.get('CONTACT_TO', user ?? '');
        if (!host || !user || !pass) {
            this.logger.warn('SMTP not configured — logging message instead');
            this.logger.log(`Contact from ${dto.name} <${dto.email}>: ${dto.message}`);
            return;
        }
        const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
        try {
            await transporter.sendMail({
                from: `"Portfolio Contact" <${user}>`,
                to,
                replyTo: dto.email,
                subject: dto.subject
                    ? `[Portfolio] ${dto.subject}`
                    : `[Portfolio] New message from ${dto.name}`,
                text: `Name: ${dto.name}\nEmail: ${dto.email}\n\n${dto.message}`,
            });
        }
        catch (err) {
            this.logger.error('Failed to send email', err);
            throw new common_1.InternalServerErrorException('Could not send message');
        }
    }
};
exports.ContactService = ContactService;
exports.ContactService = ContactService = ContactService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ContactService);
//# sourceMappingURL=contact.service.js.map