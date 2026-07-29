import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignGuestbookDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(280)
  message: string;
}
