import { ConfigService } from '@nestjs/config';
import { ContactDto } from './contact.dto';
export declare class ContactService {
    private config;
    private readonly logger;
    constructor(config: ConfigService);
    send(dto: ContactDto): Promise<void>;
}
