import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import type { WordleLocale } from './stats.types';

/** `YYYY-MM-DD`, the UTC day the daily word belongs to (see `wordle.ts` on the frontend). */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class WordleQueryDto {
  @Matches(DAY)
  day: string;

  @IsIn(['en', 'fr'])
  locale: WordleLocale;
}

/** One finished daily: the day, the language, and how many guesses — 0 for not solved. */
export class WordleResultDto extends WordleQueryDto {
  @IsInt()
  @Min(0)
  @Max(6)
  guesses: number;
}
