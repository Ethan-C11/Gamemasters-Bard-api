import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository, IsNull, type FindOptionsWhere} from "typeorm";
import {AudioTrack} from "../../../infrastructure/db/entities/audioTrack.entity.js";
import {SoundType} from "../../../shared/enums/SoundType.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {AudioTrackResponse, PaginatedAudioTrackResponse} from "../../dtos/soundTrack.schema.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";

class FetchSoundsUseCase {
    private static _instance: FetchSoundsUseCase;

    private _audioTrackRepository: Repository<AudioTrack>;
    private _userRepository: Repository<User>;

    private constructor() {
        this._audioTrackRepository = AppDataSource.getRepository(AudioTrack);
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): FetchSoundsUseCase {
        if (!FetchSoundsUseCase._instance) {
            FetchSoundsUseCase._instance = new FetchSoundsUseCase();
        }
        return FetchSoundsUseCase._instance;
    }

    async execute(userId: number = 0, type: SoundType | undefined, zone: Zone | undefined, ambiance: Ambiance | undefined, isUserImported: boolean | undefined, offset: number = 0, limit: number = 20): Promise<PaginatedAudioTrackResponse> {
        const user: User | null = await this._userRepository.findOneBy({ id: userId });
        if (!user)
            throw Error("User does not exist");

        const baseCondition: FindOptionsWhere<AudioTrack> = {};

        if (type !== undefined) baseCondition.type = type;
        if (isUserImported !== undefined) baseCondition.isUserImported = isUserImported;
        if (zone !== undefined) baseCondition.zone = zone;
        if (ambiance !== undefined) baseCondition.ambiance = ambiance;

        const finalWhereCondition: FindOptionsWhere<AudioTrack>[] = [
            { ...baseCondition, uploadedBy: { id: userId } },
            { ...baseCondition, uploadedBy: IsNull() }
        ];

        const [soundList, totalCount] = await this._audioTrackRepository.findAndCount({
            where: finalWhereCondition,
            skip: offset,
            take: limit
        });

        if(soundList.length <= 0)
            throw Error("No such sounds");

        const responseList: AudioTrackResponse[] = soundList.map(chosenSound => {
            return {
                key: chosenSound.storageKey,
                name: chosenSound.name,
                type: chosenSound.type,
                zone: chosenSound.zone,
                ambiance: chosenSound.ambiance,
                isUserImported: chosenSound.isUserImported,
            };
        });

        return {
            data: responseList,
            total: totalCount
        };

    }
}

export default FetchSoundsUseCase
