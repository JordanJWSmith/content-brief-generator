import { IsString } from 'class-validator';

export class GenerateBriefDto {
  @IsString()
  topic: string;

  @IsString()
  keyword: string;

  @IsString()
  userId: string;

  @IsString()
  content: string;
}
