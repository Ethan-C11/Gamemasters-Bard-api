import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {AudioTrack} from "../../../infrastructure/db/entities/audioTrack.entity.js";
import {MinioStorageService} from "../../../infrastructure/storage/MinioStorageService.js";
import {AudioTrackResponse} from "../../dtos/soundTrack.schema.js";
import {toAudioTrackDto} from "../../mappers/audio.mappers.js";

class DeleteAudioTrackUseCase {

    private static _instance: DeleteAudioTrackUseCase;

    private _audioTrackRepository: Repository<AudioTrack>;

    private constructor() {
        this._audioTrackRepository = AppDataSource.getRepository(AudioTrack);
    }

    static getInstance(): DeleteAudioTrackUseCase {
        if (!DeleteAudioTrackUseCase._instance) {
            DeleteAudioTrackUseCase._instance = new DeleteAudioTrackUseCase();
        }
        return DeleteAudioTrackUseCase._instance;
    }

    async execute(userId: number, key: string): Promise<AudioTrackResponse> {
        const track: AudioTrack | null = await this._audioTrackRepository.findOne({
            where: { storageKey: key },
            relations: { uploadedBy: true },
        });
        if (!track)
            throw Error("Sound does not exist");

        if (!track.isUserImported || track.uploadedBy?.id !== userId)
            throw Error("You can only delete your own sounds");

        const deleted = toAudioTrackDto(track) as AudioTrackResponse;

        await MinioStorageService.getInstance().delete(track.storageKey);
        await this._audioTrackRepository.remove(track);

        return deleted;
    }
}

export default DeleteAudioTrackUseCase
