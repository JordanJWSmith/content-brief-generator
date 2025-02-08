import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BriefDocument = HydratedDocument<Brief>;

@Schema({ timestamps: true })
export class Brief {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  topic: string;

  @Prop({ type: [String], required: true })
  outline: string[];

  @Prop({ type: [String], required: true })
  keywords: string[];

  @Prop({ default: Date.now })
  generatedAt: Date;

  @Prop({ required: true })
  markdownUrl: string;
}

export const BriefSchema = SchemaFactory.createForClass(Brief);
