import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { CreateRoomDto, MoveDto, UpdateRoomDto } from './rooms.dto';
import { CODE_PATTERN, RoomsService } from './rooms.service';
import type {
  RoomCreated,
  RoomJoined,
  RoomSnapshot,
  RoomsInfo,
} from './rooms.types';

@Controller('rooms')
@UseGuards(RateLimitGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** So the pages can say "rooms are off here" instead of failing to create one. */
  @Get()
  info(): RoomsInfo {
    return { enabled: this.rooms.enabled };
  }

  /**
   * Ten an hour per IP: a room is a held connection per guest and a slot out of
   * 200, and nobody hosts more than a handful of parties in an hour.
   */
  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000 })
  create(@Body() dto: CreateRoomDto): RoomCreated {
    if (!this.rooms.enabled) {
      throw new ForbiddenException('Rooms are off on this deployment');
    }
    return this.rooms.create(dto.kind);
  }

  /** A plain read, for "does this code exist" before a page opens the stream. */
  @Get(':code')
  snapshot(@Param('code') code: string): RoomSnapshot {
    const snapshot = this.rooms.snapshot(normaliseCode(code));
    if (!snapshot) throw new NotFoundException('No such room');
    return snapshot;
  }

  /** Nest's own `@Sse()`, as `/presence` uses: the connection is the membership. */
  @Sse(':code/events')
  events(@Param('code') code: string): Observable<{ data: RoomSnapshot }> {
    const stream = this.rooms.stream(normaliseCode(code));
    if (!stream) throw new NotFoundException('No such room');
    return stream;
  }

  /**
   * The host's verb. Two a second is what a host dragging a seek bar produces
   * once the page debounces it; the limit is there so a script cannot spray a
   * room's guests with hundreds of seeks a second.
   */
  @Post(':code/state')
  @HttpCode(200)
  @RateLimit({ limit: 120, windowMs: 60_000 })
  update(
    @Param('code') code: string,
    @Body() dto: UpdateRoomDto,
    @Headers('x-room-token') token?: string,
  ): RoomSnapshot {
    return this.rooms.update(normaliseCode(code), token, dto);
  }

  @Delete(':code')
  @HttpCode(204)
  end(
    @Param('code') code: string,
    @Headers('x-room-token') token?: string,
  ): void {
    this.rooms.end(normaliseCode(code), token);
  }

  /**
   * A game room's second seat. Twenty a minute: someone mistyping a code a few times
   * is fine, someone walking the code space looking for open seats is not.
   */
  @Post(':code/join')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  join(@Param('code') code: string): RoomJoined {
    return this.rooms.join(normaliseCode(code));
  }

  /** One drop. As generous as the host's seek limit: a game is a few dozen moves. */
  @Post(':code/move')
  @HttpCode(200)
  @RateLimit({ limit: 120, windowMs: 60_000 })
  move(
    @Param('code') code: string,
    @Body() dto: MoveDto,
    @Headers('x-room-token') token?: string,
  ): RoomSnapshot {
    return this.rooms.move(normaliseCode(code), token, dto.column);
  }

  @Post(':code/rematch')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  rematch(
    @Param('code') code: string,
    @Headers('x-room-token') token?: string,
  ): RoomSnapshot {
    return this.rooms.rematch(normaliseCode(code), token);
  }
}

/** Codes are shown upper-case but typed however; anything not code-shaped is a 404
 *  before it costs a lookup. */
function normaliseCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(upper)) throw new NotFoundException('No such room');
  return upper;
}
