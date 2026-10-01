import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomTitles } from './room-titles';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomTitles],
  exports: [RoomsService],
})
export class RoomsModule {}
