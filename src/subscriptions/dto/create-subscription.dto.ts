import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsNumber()
  userId: number;

  @IsString()
  plan: string;

  @IsOptional()
  expiresAt?: Date;
}