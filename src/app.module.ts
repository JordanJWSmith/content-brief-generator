import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { BriefsModule } from './briefs/briefs.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'brief_generator',
      autoLoadEntities: true,
      synchronize: true, // Turn off in production!
    }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/briefs'),
    UsersModule,
    BriefsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}