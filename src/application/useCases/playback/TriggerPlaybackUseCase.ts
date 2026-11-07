import {Repository} from "typeorm";
import {Session} from "../../../infrastructure/db/entities/session.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {PlaybackAction} from "../../../shared/enums/PlaybackAction.js";
import {PlaybackStatus} from "../../../shared/enums/PlaybackStatus.js";

export class TriggerPlaybackUseCase {

    private static _instance: TriggerPlaybackUseCase;

    private _sessionRepository: Repository<Session>;

    private constructor() {
        this._sessionRepository = AppDataSource.getRepository(Session);
    }

    static getInstance(): TriggerPlaybackUseCase {
        if (!TriggerPlaybackUseCase._instance) {
            TriggerPlaybackUseCase._instance = new TriggerPlaybackUseCase();
        }
        return TriggerPlaybackUseCase._instance;
    }

    async execute(sessionId: number, actorId: number, action: PlaybackAction): Promise<Session> {
        const session: Session | null = await this._sessionRepository.findOne({
            where: { id: sessionId },
            relations: { owner: true, currentMusic: true, currentEnvironment: true },
        });
        if (!session)
            throw Error("Session does not exist");

        if (session.owner.id !== actorId)
            throw Error("User is not the owner of the session");

        const now: Date = new Date();

        if (action === PlaybackAction.PLAY) {
            if (session.playbackStatus === PlaybackStatus.PLAYING)
                return session;
            if (!session.currentMusic && !session.currentEnvironment)
                throw Error("Nothing to play");

            if (session.playbackStatus === PlaybackStatus.STOPPED)
                session.playbackPositionMs = 0;
            session.playbackStatus = PlaybackStatus.PLAYING;
            session.playbackStartedAt = now;
        } else if (action === PlaybackAction.PAUSE) {
            if (session.playbackStatus !== PlaybackStatus.PLAYING)
                return session;

            session.playbackPositionMs += now.getTime() - (session.playbackStartedAt as Date).getTime();
            session.playbackStatus = PlaybackStatus.PAUSED;
            session.playbackStartedAt = null;
        } else {
            session.playbackStatus = PlaybackStatus.STOPPED;
            session.playbackPositionMs = 0;
            session.playbackStartedAt = null;
        }

        return this._sessionRepository.save(session);
    }
}
