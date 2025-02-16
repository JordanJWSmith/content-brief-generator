import { IsString } from 'class-validator';

export class AnalyzeCompetitorsDto {
  @IsString()
  topic: string;

  @IsString()
  focus: string;

  @IsString()
  goal: string;

  @IsString()
  tone: string;
}
