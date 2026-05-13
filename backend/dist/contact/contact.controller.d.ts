import { ContactService } from './contact.service';
import { ContactDto } from './contact.dto';
export declare class ContactController {
    private readonly contactService;
    constructor(contactService: ContactService);
    send(dto: ContactDto): Promise<{
        ok: boolean;
    }>;
}
