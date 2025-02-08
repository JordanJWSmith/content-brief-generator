import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { Brief } from './schemas/brief.schema';
import { SeoService } from './seo/seo.service';
import { AnalyzeKeywordsDto } from './dto/analyze-keywords.dto';
import { CompetitorAnalysisService } from './seo/competitor-analysis.service';

@Controller('briefs')
export class BriefsController {
  constructor(
    private readonly briefsService: BriefsService,
    private readonly seoService: SeoService,
    private readonly competitorAnalysisService: CompetitorAnalysisService,
  ) {}

  @Post()
  async create(@Body() generateBriefDto: GenerateBriefDto): Promise<Brief> {
    return this.briefsService.create(generateBriefDto);
  }

  @Get(':userId')
  async findByUserId(@Param('userId') userId: string): Promise<Brief[]> {
    return this.briefsService.findByUserId(userId);
  }

  @Get()
  async findAll(): Promise<Brief[]> {
    return this.briefsService.findAll();
  }

  @Post('analyze-keywords')
  async analyzeKeywords(
    @Body() analyzeKeywordsDto: AnalyzeKeywordsDto,
  ): Promise<any> {
    const { content } = analyzeKeywordsDto; // DTO validates the input
    return this.seoService.analyzeKeywords(content);
  }

  @Post('analyze-competitors')
  async analyzeCompetitors(@Body('keyword') keyword: string): Promise<any> {
    return this.competitorAnalysisService.fetchCompetitorData(keyword);
  }
}
