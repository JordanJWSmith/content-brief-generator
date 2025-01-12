import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Brief {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  topic: string;

  @Column('text')
  content: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}