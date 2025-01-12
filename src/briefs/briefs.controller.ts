import { Controller, Post, Body, Get } from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { Brief } from './entities/brief.entity';

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  @Post()
  async create(@Body() generateBriefDto: GenerateBriefDto): Promise<Brief> {
    return this.briefsService.create(generateBriefDto);
  }

  @Get()
  async findAll(): Promise<Brief[]> {
    return this.briefsService.findAll();
  }
}