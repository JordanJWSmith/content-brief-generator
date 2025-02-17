import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';
import { Brief, BriefSchema } from './schemas/brief.schema';
import { SeoService } from './seo/seo.service';
import { CompetitorAnalysisService } from './seo/competitor-analysis.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Brief.name, schema: BriefSchema }]),
  ],
  controllers: [BriefsController],
  providers: [BriefsService, SeoService, CompetitorAnalysisService],
  exports: [BriefsService],
})
export class BriefsModule {}
