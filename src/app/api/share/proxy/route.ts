import { NextRequest, NextResponse } from 'next/server';
import { validateShare } from '@/lib/share-service';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { token, action, params } = body;

        if (!token) {
            return NextResponse.json({ error: "Missing token" }, { status: 401 });
        }

        // 1. Validate Token & Get Credentials
        const payload = await validateShare(token);
        
        // 2. Setup Client
        const client = new S3Client({
            region: payload.region,
            endpoint: payload.endpoint,
            credentials: {
                accessKeyId: payload.ak,
                secretAccessKey: payload.sk,
            },
            forcePathStyle: true,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        });

        // 3. Enforce Bucket
        if (params && params.bucket && params.bucket !== payload.bucket) {
             return NextResponse.json({ error: "Invalid bucket" }, { status: 403 });
        }
        // Force bucket in params just in case
        const safeParams = { ...params, bucket: payload.bucket };

        let result;

        switch (action) {
            case "list":
                const listCmd = new ListObjectsV2Command({
                    Bucket: safeParams.bucket,
                    Prefix: safeParams.prefix,
                    Delimiter: safeParams.delimiter || "/",
                    MaxKeys: safeParams.maxKeys || 1000,
                    ContinuationToken: safeParams.continuationToken
                });
                const data = await client.send(listCmd);
                result = {
                    Contents: data.Contents?.map(c => ({
                        Key: c.Key,
                        Size: c.Size,
                        LastModified: c.LastModified,
                        ETag: c.ETag
                    })),
                    CommonPrefixes: data.CommonPrefixes?.map(p => ({
                        Prefix: p.Prefix
                    })),
                    NextContinuationToken: data.NextContinuationToken,
                    IsTruncated: data.IsTruncated
                };
                break;

            case "presign-get":
                const getCmd = new GetObjectCommand({
                    Bucket: safeParams.bucket,
                    Key: safeParams.key
                });
                const rawGetUrl = await getSignedUrl(client, getCmd, { expiresIn: 3600 });
                const getUrlObj = new URL(rawGetUrl);
                
                // Encode endpoint to pass it to the proxy
                const encodedEndpoint = Buffer.from(payload.endpoint).toString('base64url');
                const proxyGetUrl = `/s3-proxy/${encodedEndpoint}${getUrlObj.pathname}${getUrlObj.search}`;
                
                result = { url: proxyGetUrl };
                break;

            default:
                return NextResponse.json({ error: "Action not allowed" }, { status: 403 });
        }

        return NextResponse.json(result);

    } catch (e: any) {
        console.error("Share Proxy Error:", e);
        return NextResponse.json({ error: e.message }, { status: 401 });
    }
}
