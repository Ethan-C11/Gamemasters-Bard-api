import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, type Relation } from 'typeorm';
import { User } from './user.entity.js';

@Entity()
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    @Column({ name: 'user_id' })
    userId: number;

    @Index()
    @Column({ name: 'token_hash', type: 'varchar' })
    tokenHash: string;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date;

    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}