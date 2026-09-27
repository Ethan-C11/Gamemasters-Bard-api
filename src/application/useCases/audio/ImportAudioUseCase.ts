import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {AudioTrack} from "../../../infrastructure/db/entities/audioTrack.entity.js";
import {SoundType} from "../../../shared/enums/SoundType.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import {MinioStorageService} from "../../../infrastructure/storage/MinioStorageService.js";
import {MultipartFile} from "@fastify/multipart";
import {AudioTrackResponse} from "../../dtos/soundTrack.schema.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";

class ImportAudioUseCase {

    private static _instance: ImportAudioUseCase;

    private _audioTrackRepository: Repository<AudioTrack>;
    private _userRepository: Repository<User>;
    private _allowedExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];

    private _maxMbPerUser : number = 100
    private _maxMbPerFile : number = 10

    private constructor() {
        this._audioTrackRepository = AppDataSource.getRepository(AudioTrack);
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): ImportAudioUseCase {
        if (!ImportAudioUseCase._instance) {
            ImportAudioUseCase._instance = new ImportAudioUseCase();
        }
        return ImportAudioUseCase._instance;
    }

    static getExtension(filename: string): string {
        const lastDot = filename.lastIndexOf('.');
        return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
    }

    async execute(userId: number = 0, file : MultipartFile | undefined, name: string, type: SoundType, zone: Zone | undefined, ambiance : Ambiance | undefined, isUserImported : boolean): Promise<AudioTrackResponse> {
        if (!file)
            throw Error("No file selected" );

        const extension = ImportAudioUseCase.getExtension(file.filename);

        if (!this._allowedExtensions.includes(extension))
            throw Error(`File type "${file.mimetype}" is not allowed`);

        if(!ambiance && !zone)
            throw Error("You need to select at least one zone or ambiance" );


        const buffer = await file.toBuffer();
        if(buffer.length / 1000000 > this._maxMbPerFile)
            throw Error(`Maximum file size is ${this._maxMbPerFile}`);

        if(!isUserImported)
            userId = 0
        else
        {
            let totalUploadedFilesSize : number = 0;
            const userSounds : AudioTrack[] = await this._audioTrackRepository.findBy({ uploadedBy: {id: userId}, isUserImported: true });
            for ( const userSound of userSounds)
                totalUploadedFilesSize += userSound.sizeInBytes;

            totalUploadedFilesSize = totalUploadedFilesSize / 1000000;
            if((totalUploadedFilesSize + (buffer.length / 1000000)) > this._maxMbPerUser)
                throw new Error(`Maximum upload capacity of ${this._maxMbPerUser} is reached for this user`)
        }

        const key = `sounds/${type}/${userId}/${file.filename}`;

        await MinioStorageService.getInstance().upload(key, buffer, buffer.length, file.mimetype);

        let uploader: User | null = null;
        if (isUserImported && userId) {
            uploader = await this._userRepository.findOneBy({ id: userId });
            if (!uploader)
                throw Error("User does not exist");
        }

        const audioTrack = this._audioTrackRepository.create({
            name: name,
            storageKey: key,
            mimeType: file.mimetype,
            sizeInBytes: buffer.length,
            type: type,
            zone: zone ?? null,
            ambianceMusic: ambiance ?? null,
            uploadedBy: uploader,
            isUserImported: isUserImported,
        });

        await this._audioTrackRepository.save(audioTrack);

         return {
                 key: key,
                 name: name,
                 type: type,
                 zone: zone,
                 ambiance: ambiance,
                 isUserImported: isUserImported,
        }

    }
}

export default ImportAudioUseCase
