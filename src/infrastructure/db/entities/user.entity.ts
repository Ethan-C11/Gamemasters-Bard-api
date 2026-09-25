import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToMany, type Relation} from 'typeorm';
import {Session} from "./session.entity.js";
import {AudioTrack} from "./audioTrack.entity.js";
import {Role} from "../../../shared/enums/Role.js";
import {ActivationToken} from "./activationToken.entity.js";

@Entity()
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: number;
    @Column()
    username: string;
    @Column({unique: true})
    email: string;
    @Column({type: "varchar", nullable: true})
    hashedPassword: string | null;
    @CreateDateColumn()
    createdAt: Date;
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
}