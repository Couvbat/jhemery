import { Controller, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PresenceService } from './presence.service';
import { PresenceUpdate } from './presence.types';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * Nest's own `@Sse()` — no new dependency, and the connection is the
   * subscription, so a visitor closing the tab is a plain unsubscribe.
   */
  @Sse()
  stream(): Observable<{ data: PresenceUpdate }> {
    return this.presenceService.stream();
  }
}
