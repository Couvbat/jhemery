import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class StartJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  url: string;
}
