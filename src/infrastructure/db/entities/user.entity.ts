import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToMany, type Relation} from 'typeorm';
import {Session} from "./session.entity.js";
import {AudioTrack} from "./audioTrack.entity.js";
import {Role} from "../../../shared/enums/Role.js";
import {ActivationToken} from "./activationToken.entity.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    username: string;
    @Column({unique: true})
    email: string;
    @Column({type: "varchar", nullable: true})
    hashedPassword: string | null;
    @Column({ type: 'timestamptz', nullable: true })
    lastConnection: Date | null;
    @OneToMany(() => Session, (sessionEntity) => sessionEntity.owner)
    ownedSessions: Relation<Session[]>;
    @ManyToMany(() => Session, (session) => session.sessionMembers)
    joinedSessions: Relation<Session[]>;
    @OneToMany(() => AudioTrack, (audioTrack) => audioTrack.uploadedBy)
    importedSounds: Relation<AudioTrack[]>;
    @Column({
        type: "enum",
        enum: Role,
        default: Role.USER,
    })
    role: Role;

    @OneToMany(() => ActivationToken, (token) => token.user)
    activationTokens: Relation<ActivationToken[]>;
    @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING_ACTIVATION })
    userStatus: UserStatus;

    @Column({type: 'boolean', default: false})
    deletionWarningSent: boolean;
}