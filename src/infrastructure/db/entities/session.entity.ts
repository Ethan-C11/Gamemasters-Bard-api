import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, ManyToMany, JoinTable, type Relation} from 'typeorm';
import {User} from "./user.entity.js";
import {AudioTrack} from "./audioTrack.entity.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import {PlaybackStatus} from "../../../shared/enums/PlaybackStatus.js";

@Entity()
export class Session {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, (user) => user.ownedSessions)
    owner: Relation<User>;

    @Column()
    sessionName: string;

    @Column()
    inviteCode: string;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToMany(() => User, (user) => user.joinedSessions)
    @JoinTable()
    sessionMembers: Relation<User[]>;

    @Column({ type: 'int', array: true, default: [] })
    alreadyPlayedMusic: number[];

    @Column({ type: 'int', array: true, default: [] })
    alreadyPlayedEnvironment: number[];

    @ManyToOne(() => AudioTrack, { nullable: true, onDelete: 'SET NULL' })
    currentMusic: Relation<AudioTrack> | null;

    @ManyToOne(() => AudioTrack, { nullable: true, onDelete: 'SET NULL' })
    currentEnvironment: Relation<AudioTrack> | null;

    @Column({ type: 'enum', enum: Zone, nullable: true })
    currentZone: Zone | null;

    @Column({ type: 'enum', enum: Ambiance, nullable: true })
    currentAmbiance: Ambiance | null;

    @Column({ type: 'timestamp', nullable: true })
    playbackStartedAt: Date | null;

    @Column({ type: 'enum', enum: PlaybackStatus, default: PlaybackStatus.STOPPED })
    playbackStatus: PlaybackStatus;

    @Column({ type: 'int', default: 0 })
    playbackPositionMs: number;
}