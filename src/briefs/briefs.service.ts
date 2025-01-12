import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Brief, BriefDocument } from './schemas/brief.schema';
import { GenerateBriefDto } from './dto/generate-brief.dto';

@Injectable()
export class BriefsService {
  constructor(
    @InjectModel(Brief.name) private readonly briefModel: Model<BriefDocument>,
  ) {}

  async create(generateBriefDto: GenerateBriefDto): Promise<Brief> {
    const createdBrief = new this.briefModel(generateBriefDto);
    return createdBrief.save();
  }

  async findAll(): Promise<Brief[]> {
    return this.briefModel.find().exec();
  }

  async findByUserId(userId: string): Promise<Brief[]> {
    return this.briefModel.find({ userId }).exec();
  }
}
