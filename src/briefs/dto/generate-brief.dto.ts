import { IsString } from 'class-validator';

export class GenerateBriefDto {
  @IsString()
  topic: string;

  @IsString()
  content: string;
}
