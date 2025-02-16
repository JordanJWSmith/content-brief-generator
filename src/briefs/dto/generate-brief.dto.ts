import { IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class Competitor {
  @IsString()
  title: string;

  @IsString()
  link: string;

  @IsString()
  snippet: string;

  @IsArray()
  headings: string[];

  @IsNumber()
  wordCount: number;
}

export class GenerateBriefDto {
  @IsString()
  userId: string;

  @IsString()
  selectedAngle: string;

  @IsString()
  chosenPerspective: string;

  @IsString()
  focus: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Competitor)
  competitors: Competitor[];

  @IsString()
  tone: string;

  @IsString()
  goal: string;
}
