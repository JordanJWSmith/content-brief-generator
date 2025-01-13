import { IsString, MinLength } from 'class-validator';

export class AnalyzeKeywordsDto {
  @IsString()
  @MinLength(10, { message: 'Content must be at least 10 characters long' })
  content: string;
}
