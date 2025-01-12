import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';
import { Brief } from './entities/brief.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Brief])],
  controllers: [BriefsController],
  providers: [BriefsService],
  exports: [BriefsService],
})
export class BriefsModule {}
