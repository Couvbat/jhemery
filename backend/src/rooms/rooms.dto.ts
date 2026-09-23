import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { RoomKind } from './rooms.types';

export class CreateRoomDto {
  @IsIn(['watch', 'radio'])
  kind: RoomKind;
}

/**
 * A partial state from the host. Every field is optional so a play/pause is one
 * boolean on the wire; `media: null` unloads the current item, `undefined` leaves
 * it alone. Shape is checked here, meaning (is this id or URL allowed?) in the
 * service, per room kind.
 */
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  media?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(864_000)
  position?: number;

  @IsOptional()
  @IsBoolean()
  playing?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  queue?: string[];
}
