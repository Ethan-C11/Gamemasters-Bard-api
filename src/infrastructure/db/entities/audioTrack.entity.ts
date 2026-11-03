import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    type Relation
} from 'typeorm';
import { User } from './user.entity.js';
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import {SoundType} from "../../../shared/enums/SoundType.js";

@Entity()
export class AudioTrack {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    name: string;
    @Column({ unique: true })
    storageKey: string;
    @Column()
    mimeType: string;
    @Column()
    sizeInBytes: number;
    @Column({ type: 'enum', enum: SoundType })
    type: SoundType;
    @Column({ type: 'enum', enum: Zone })
    zone: Zone;
    @Column({ type: 'enum', enum: Ambiance })
    ambiance: Ambiance;
    @ManyToOne(() => User, (user) => user.importedSounds, { nullable: true })
    @JoinColumn()
    uploadedBy: Relation<User> | null;
    @Column({ default: false })
    isUserImported: boolean;
    @CreateDateColumn()
    createdAt: Date;
}
