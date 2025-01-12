import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const user = this.userRepository.create(createUserDto);
      return await this.userRepository.save(user);
    } catch (error) {
      if (error.code === '23505') { // PostgreSQL duplicate key error code
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async findOne(email: string): Promise<User | undefined> {
    return this.userRepository.findOneBy({ email });
  }
}