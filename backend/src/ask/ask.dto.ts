import { IsIn, IsString, Length } from 'class-validator';

export class AskDto {
  // Long enough for a real question, short enough that this is not a free
  // text-completion API someone can point a script at.
  @IsString()
  @Length(3, 240)
  question: string;

  @IsIn(['en', 'fr'])
  locale: 'en' | 'fr';
}
