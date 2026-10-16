import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
