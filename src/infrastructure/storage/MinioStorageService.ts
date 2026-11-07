import { Client } from "minio";
import { Readable } from "node:stream";

export class MinioStorageService {
    private static instance: MinioStorageService;

    private readonly client: Client;
    private readonly bucket: string;

    private constructor() {
        this.bucket = process.env.S3_BUCKET as string;

        const endpoint = new URL(process.env.S3_ENDPOINT as string);

        this.client = new Client({
            endPoint: endpoint.hostname,
            port: Number(endpoint.port) || (endpoint.protocol === "https:" ? 443 : 80),
            useSSL: endpoint.protocol === "https:",
            accessKey: process.env.S3_ACCESS_KEY as string,
            secretKey: process.env.S3_SECRET_KEY as string,
            region: process.env.S3_REGION,
        });
    }

    public static getInstance(): MinioStorageService {
        if (!MinioStorageService.instance) {
            MinioStorageService.instance = new MinioStorageService();
        }
        return MinioStorageService.instance;
    }


    async ensureBucketExists(): Promise<void> {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
            await this.client.makeBucket(this.bucket, process.env.S3_REGION);
        }
    }

    async ping(): Promise<void> {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
            throw new Error("Bucket does not exist");
        }
    }

    async upload(key: string, body: Buffer | Readable, size: number, contentType: string): Promise<void> {
        await this.client.putObject(this.bucket, key, body, size, {
            "Content-Type":  contentType,
        });
    }

    async download(key: string): Promise<Readable> {
        return this.client.getObject(this.bucket, key);
    }

    async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
        return this.client.presignedGetObject(this.bucket, key, expiresInSeconds);
    }

    async delete(key: string): Promise<void> {
        await this.client.removeObject(this.bucket, key);
    }

    async listByPrefix(prefix: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const keys: string[] = [];
            const stream = this.client.listObjectsV2(this.bucket, prefix, true);

            stream.on("data", (obj) => {
                if (obj.name) keys.push(obj.name);
            });
            stream.on("end", () => resolve(keys));
            stream.on("error", (err) => reject(err));
        });
    }
}