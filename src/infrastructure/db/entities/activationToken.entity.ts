import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    type Relation, Index
} from 'typeorm';
import { User } from './user.entity.js';
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";

@Entity()
export class ActivationToken {
    @PrimaryGeneratedColumn()
    id: string;

    @ManyToOne(() => User, (user) => user.activationTokens, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    @Column({ name: 'user_id' })
    userId: number;

    @Index()
    @Column({ name: 'token_hash' })
    tokenHash: string;

    @Column({ type: 'enum', enum: TokenPurpose, default: TokenPurpose.ACCOUNT_ACTIVATION })
    purpose: TokenPurpose;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date;

    @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
    usedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}