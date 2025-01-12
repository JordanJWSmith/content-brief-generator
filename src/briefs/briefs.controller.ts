import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { Brief } from './schemas/brief.schema';

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

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
}
