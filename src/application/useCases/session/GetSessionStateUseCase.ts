import {Repository} from "typeorm";
import {Session} from "../../../infrastructure/db/entities/session.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";

export class GetSessionStateUseCase {

    private static _instance: GetSessionStateUseCase;

    private _sessionRepository: Repository<Session>;

    private constructor() {
        this._sessionRepository = AppDataSource.getRepository(Session);
    }

    static getInstance(): GetSessionStateUseCase {
        if (!GetSessionStateUseCase._instance) {
            GetSessionStateUseCase._instance = new GetSessionStateUseCase();
        }
        return GetSessionStateUseCase._instance;
    }

    async execute(sessionId: number, actorId: number): Promise<Session> {
        const session: Session | null = await this._sessionRepository.findOne({
            where: { id: sessionId },
            relations: { owner: true, sessionMembers: true, currentMusic: true, currentEnvironment: true },
        });
        if (!session)
            throw Error("Session does not exist");

        const isMember: boolean = session.owner.id === actorId || (session.sessionMembers ?? []).some(m => m.id === actorId);
        if (!isMember)
            throw Error("User is not a member of this session");

        return session;
    }
}
