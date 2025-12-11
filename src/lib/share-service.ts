import { CompactEncrypt, compactDecrypt } from 'jose';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { S3Credentials } from './auth-context';

const SECRET = process.env.SHARE_ENCRYPTION_SECRET || 'default-dev-secret-do-not-use-in-prod';
const ENC_ALG = 'A256GCM';

export interface ShareConfig {
    id: string;
    bucket: string;
    memo: string;
    createdAt: number;
    expiresAt: number;
    permissions: string[];
}

export interface ShareTokenPayload {
    id: string;
    bucket: string;
    ak: string;
    sk: string;
    region: string;
    endpoint: string;
}

const getEndpoint = (creds: S3Credentials) => {
    return process.env.S3_API_ENDPOINT || creds.endpoint || "http://localhost:3900";
}

const getRegion = (creds: S3Credentials) => {
    return process.env.S3_API_REGION || creds.region || "garage";
}

// Helper to get S3 client
const getClient = (creds: S3Credentials) => {
    return new S3Client({
        region: getRegion(creds),
        endpoint: getEndpoint(creds),
        credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
        },
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
};

// Helper to derive key
const getDerivedKey = () => {
    const encoder = new TextEncoder();
    const keyBytes = new Uint8Array(32);
    const secretBytes = encoder.encode(SECRET);
    for(let i=0; i<32; i++) {
        keyBytes[i] = secretBytes[i % secretBytes.length];
    }
    return keyBytes;
}

export async function createShare(
    creds: S3Credentials,
    bucket: string,
    memo: string,
    expiresAt: number
): Promise<{ token: string, id: string }> {
    const id = crypto.randomUUID();
    const client = getClient(creds);
    
    // 1. Upload Metadata to S3
    const metadata: ShareConfig = {
        id,
        bucket,
        memo,
        createdAt: Date.now(),
        expiresAt,
        permissions: ["LIST", "READ"]
    };
    
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `.garage/shares/${id}.json`,
        Body: JSON.stringify(metadata),
        ContentType: "application/json"
    }));

    // 2. Generate JWE Token
    const payload: ShareTokenPayload = {
        id,
        bucket,
        ak: creds.accessKeyId,
        sk: creds.secretAccessKey,
        region: getRegion(creds),
        endpoint: getEndpoint(creds)
    };
    
    const keyBytes = getDerivedKey();

    const token = await new CompactEncrypt(
        new TextEncoder().encode(JSON.stringify(payload))
    )
    .setProtectedHeader({ alg: 'dir', enc: ENC_ALG })
    .encrypt(keyBytes);

    return { token, id };
}

export async function regenerateShareToken(
    creds: S3Credentials,
    bucket: string,
    id: string
): Promise<{ token: string }> {
    const client = getClient(creds);
    
    // Verify existence
    try {
        await client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: `.garage/shares/${id}.json`
        }));
    } catch (e) {
        throw new Error("Share not found or access denied");
    }

    // Generate JWE Token
    const payload: ShareTokenPayload = {
        id,
        bucket,
        ak: creds.accessKeyId,
        sk: creds.secretAccessKey,
        region: getRegion(creds),
        endpoint: getEndpoint(creds)
    };
    
    const keyBytes = getDerivedKey();

    const token = await new CompactEncrypt(
        new TextEncoder().encode(JSON.stringify(payload))
    )
    .setProtectedHeader({ alg: 'dir', enc: ENC_ALG })
    .encrypt(keyBytes);

    return { token };
}

export async function validateShare(token: string): Promise<ShareTokenPayload> {
    const keyBytes = getDerivedKey();

    try {
        const { plaintext } = await compactDecrypt(token, keyBytes);
        const payload = JSON.parse(new TextDecoder().decode(plaintext)) as ShareTokenPayload;
        
        // Check S3 Metadata
        const client = getClient({
            accessKeyId: payload.ak,
            secretAccessKey: payload.sk,
            region: payload.region,
            endpoint: payload.endpoint
        });

        try {
            const res = await client.send(new GetObjectCommand({
                Bucket: payload.bucket,
                Key: `.garage/shares/${payload.id}.json`
            }));
            
            const body = await res.Body?.transformToString();
            if (!body) throw new Error("Empty metadata");
            
            const metadata = JSON.parse(body) as ShareConfig;
            
            if (metadata.expiresAt !== -1 && Date.now() > metadata.expiresAt) {
                throw new Error("Share link expired");
            }
            
            return payload;
        } catch (e: any) {
            if (e.name === 'NoSuchKey' || e.name === 'NotFound') {
                throw new Error("Share link revoked");
            }
            throw e;
        }
    } catch (e) {
        console.error("Token validation failed:", e);
        throw new Error("Invalid or expired token");
    }
}

export async function listShares(creds: S3Credentials, bucket: string): Promise<ShareConfig[]> {
    const client = getClient(creds);
    try {
        const res = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: ".garage/shares/"
        }));
        
        if (!res.Contents) return [];
        
        const shares: ShareConfig[] = [];
        for (const obj of res.Contents) {
            try {
                const getRes = await client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: obj.Key
                }));
                const body = await getRes.Body?.transformToString();
                if (body) {
                    shares.push(JSON.parse(body));
                }
            } catch (e) {
                console.warn("Failed to read share metadata:", obj.Key);
            }
        }
        return shares;
    } catch (e) {
        console.error("Failed to list shares:", e);
        return [];
    }
}

export async function revokeShare(creds: S3Credentials, bucket: string, id: string) {
    const client = getClient(creds);
    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: `.garage/shares/${id}.json`
    }));
}

export async function updateShare(creds: S3Credentials, bucket: string, id: string, newExpiresAt: number) {
    const client = getClient(creds);
    const key = `.garage/shares/${id}.json`;
    
    // Read existing
    const getRes = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
    }));
    const body = await getRes.Body?.transformToString();
    if (!body) throw new Error("Share not found");
    
    const metadata = JSON.parse(body) as ShareConfig;
    metadata.expiresAt = newExpiresAt;
    
    // Write back
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(metadata),
        ContentType: "application/json"
    }));
}
