import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  /** The signer's language, for the optional reply. Stored only with moderation on. */
  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';
}
