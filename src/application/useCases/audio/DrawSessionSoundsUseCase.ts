import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository, IsNull, type FindOptionsWhere} from "typeorm";
import {AudioTrack} from "../../../infrastructure/db/entities/audioTrack.entity.js";
import {SoundType} from "../../../shared/enums/SoundType.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import {AudioTrackResponse, DrawSessionSoundsResponse} from "../../dtos/soundTrack.schema.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {Session} from "../../../infrastructure/db/entities/session.entity.js";

type PickedSound = { sound: AudioTrack | null; history: number[] };

class DrawSessionSoundsUseCase {

    private static _instance: DrawSessionSoundsUseCase;

    private _audioTrackRepository: Repository<AudioTrack>;
    private _userRepository: Repository<User>;
    private _sessionRepository: Repository<Session>;

    private constructor() {
        this._audioTrackRepository = AppDataSource.getRepository(AudioTrack);
        this._userRepository = AppDataSource.getRepository(User);
        this._sessionRepository = AppDataSource.getRepository(Session);
    }

    static getInstance(): DrawSessionSoundsUseCase {
        if (!DrawSessionSoundsUseCase._instance) {
            DrawSessionSoundsUseCase._instance = new DrawSessionSoundsUseCase();
        }
        return DrawSessionSoundsUseCase._instance;
    }

    async execute(userId: number, sessionId: number, zone: Zone | undefined, ambiance: Ambiance | undefined): Promise<DrawSessionSoundsResponse> {
        const user: User | null = await this._userRepository.findOneBy({ id: userId });
        if (!user) throw Error("User does not exist");

        const session: Session | null = await this._sessionRepository.findOne({
            where: { id: sessionId },
            relations: { owner: true, sessionMembers: true },
        });

        if (!session) throw Error("Session does not exist");
        if (session.owner.id !== user.id) throw Error("User is not the owner of the session");

        if (zone === undefined && ambiance === undefined)
            throw Error("You need to select at least one zone or ambiance");

        const hostId: number = session.owner.id;
        const music = await this.pickSound(SoundType.MUSIC, hostId, zone, ambiance, session.alreadyPlayedMusic);
        const environment = await this.pickSound(SoundType.ENVIRONMENT, hostId, zone, ambiance, session.alreadyPlayedEnvironment);

        if (!music.sound && !environment.sound)
            throw Error("No such sounds");

        session.alreadyPlayedMusic = music.history;
        session.alreadyPlayedEnvironment = environment.history;
        await this._sessionRepository.save(session);

        return {
            music: this.toResponse(music.sound),
            environment: this.toResponse(environment.sound),
        };
    }

    private async pickSound(type: SoundType, hostId: number, zone: Zone | undefined, ambiance: Ambiance | undefined, previousHistory: number[]): Promise<PickedSound> {
        const where: FindOptionsWhere<AudioTrack> = { type: type };
        if (zone !== undefined) where.zone = zone;
        if (ambiance !== undefined) where.ambiance = ambiance;

        const soundList: AudioTrack[] = await this._audioTrackRepository.find({
            where: [
                { ...where, uploadedBy: IsNull() },
                { ...where, uploadedBy: { id: hostId } },
            ],
        });
        if (soundList.length <= 0)
            return { sound: null, history: previousHistory };

        let history: number[] = [...previousHistory];
        let availableSounds = soundList.filter(sound => !history.includes(sound.id));

        if (availableSounds.length === 0) {
            availableSounds = soundList;
            history = [];
        }

        const chosenSound = availableSounds[Math.floor(Math.random() * availableSounds.length)];
        if (!chosenSound)
            throw Error("Error: No sound selected.");

        history.push(chosenSound.id);
        if (history.length > 5) {
            history.shift();
        }

        return { sound: chosenSound, history: history };
    }

    private toResponse(sound: AudioTrack | null): AudioTrackResponse | null {
        if (!sound)
            return null;

        return {
            key: sound.storageKey,
            name: sound.name,
            type: sound.type,
            zone: sound.zone,
            ambiance: sound.ambiance,
            isUserImported: sound.isUserImported,
        };
    }
}

export default DrawSessionSoundsUseCase;
