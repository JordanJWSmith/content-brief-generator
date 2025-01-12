import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brief } from './entities/brief.entity';
import { GenerateBriefDto } from './dto/generate-brief.dto';

@Injectable()
export class BriefsService {
  constructor(
    @InjectRepository(Brief)
    private readonly briefRepository: Repository<Brief>,
  ) {}

  async create(generateBriefDto: GenerateBriefDto): Promise<Brief> {
    const brief = this.briefRepository.create(generateBriefDto);
    return this.briefRepository.save(brief);
  }

  async findAll(): Promise<Brief[]> {
    return this.briefRepository.find();
  }
}
