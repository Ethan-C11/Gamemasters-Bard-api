import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, ManyToMany, JoinTable, type Relation} from 'typeorm';
import {User} from "./user.entity.js";

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
    alreadyPlayedAmbianceMusic: number[];

    @Column({ type: 'int', array: true, default: [] })
    alreadyPlayedZoneMusic: number[];
}