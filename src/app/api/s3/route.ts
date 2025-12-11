import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, PutBucketCorsCommand, GetBucketCorsCommand, ListBucketsCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
    try {
        const text = await req.text();
        if (!text) {
            return NextResponse.json({ error: "Empty request body" }, { status: 400 });
        }
        const body = JSON.parse(text);
        const { action, config, params } = body;
        
        // Use environment variable for S3 endpoint if available, otherwise fallback to config or default
        // For server-side operations (proxy), we prefer the internal environment variable.
        // For client-side operations (presigned URLs), we prefer the config endpoint (public).
        const internalEndpoint = process.env.S3_API_ENDPOINT || config?.endpoint || "http://localhost:3900";
        const publicEndpoint = config?.endpoint || process.env.S3_API_ENDPOINT || "http://localhost:3900";
        
        const s3Region = process.env.S3_API_REGION || config?.region || "garage";

        if (!config || !config.accessKeyId || !config.secretAccessKey) {
            console.error("Missing S3 configuration:", config);
            return NextResponse.json({ error: "Missing S3 configuration" }, { status: 400 });
        }

        const client = new S3Client({
            region: s3Region,
            endpoint: internalEndpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: true,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        });

        // Client for generating presigned URLs that the browser will use
        const signingClient = new S3Client({
            region: s3Region,
            endpoint: publicEndpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: true,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        });

        let result;

        switch (action) {
            case "getKeyPermissions":
                const adminTokenForKey = process.env.GARAGE_ADMIN_TOKEN;
                if (!adminTokenForKey) {
                    // If no admin token, we can't check global permissions easily.
                    // Assume false for safety, or maybe true if we want to be permissive?
                    // Better to assume false and hide the button.
                    result = { createBucket: false };
                } else {
                    try {
                        const garageEndpoint = process.env.GARAGE_API_BASE_URL || "http://localhost:3903";
                        const keyRes = await fetch(`${garageEndpoint}/v2/GetKeyInfo?id=${config.accessKeyId}`, {
                            headers: { "Authorization": `Bearer ${adminTokenForKey}` }
                        });
                        
                        if (keyRes.ok) {
                            const keyData = await keyRes.json();
                            result = { createBucket: keyData.permissions?.createBucket || false };
                        } else {
                            result = { createBucket: false };
                        }
                    } catch (e) {
                        console.warn("Failed to check key permissions:", e);
                        result = { createBucket: false };
                    }
                }
                break;

            case "listBuckets":
                const listBucketsCmd = new ListBucketsCommand({});
                const bucketsData = await client.send(listBucketsCmd);
                let buckets = bucketsData.Buckets?.map(b => ({
                    id: b.Name, // S3 doesn't give ID, use Name
                    globalAlias: b.Name,
                    name: b.Name,
                    creationDate: b.CreationDate,
                    objects: 0,
                    bytes: 0,
                    quotas: { maxSize: null, maxObjects: null }
                })) || [];

                // Optimization: If we have GARAGE_ADMIN_TOKEN, try to fetch usage stats
                const adminTokenForList = process.env.GARAGE_ADMIN_TOKEN;
                if (adminTokenForList) {
                    try {
                        const garageEndpoint = process.env.GARAGE_API_BASE_URL || "http://localhost:3903";
                        // We can't easily batch get info for all buckets by alias efficiently without listing all buckets as admin
                        // So we list all buckets as admin, and match them by alias
                        const adminListRes = await fetch(`${garageEndpoint}/v2/ListBuckets`, {
                            headers: { "Authorization": `Bearer ${adminTokenForList}` }
                        });
                        
                        if (adminListRes.ok) {
                            const adminBuckets = await adminListRes.json();
                            // Create a map for faster lookup. 
                            // Note: S3 ListBuckets returns aliases (names). Garage ListBuckets returns IDs and aliases.
                            // We need to match S3 bucket name to Garage bucket alias.
                            
                            // We need detailed info (size/objects) which ListBuckets might not provide fully?
                            // Garage v0.9 ListBuckets returns: [{id, globalAliases, localAliases}]
                            // It does NOT return size/objects. We need GetBucketInfo for that.
                            // Doing GetBucketInfo for every bucket might be slow if there are many.
                            // But let's try to do it for the visible ones or just do it in parallel with a limit.
                            
                            // Actually, let's just try to match IDs first to be able to fetch info.
                            // But we only have names from S3.
                            
                            // Strategy:
                            // 1. Get Admin ListBuckets -> Map<Alias, ID>
                            // 2. For each S3 bucket, find ID.
                            // 3. Fetch GetBucketInfo for that ID (in parallel batches).
                            
                            const aliasToId = new Map();
                            adminBuckets.forEach((b: any) => {
                                b.globalAliases?.forEach((a: string) => aliasToId.set(a, b.id));
                                aliasToId.set(b.id, b.id); // Also map ID to ID just in case
                            });

                            // Limit concurrency
                            const chunkSize = 5;
                            for (let i = 0; i < buckets.length; i += chunkSize) {
                                const chunk = buckets.slice(i, i + chunkSize);
                                await Promise.all(chunk.map(async (b: any) => {
                                    const id = aliasToId.get(b.name);
                                    if (id) {
                                        try {
                                            const infoRes = await fetch(`${garageEndpoint}/v2/GetBucketInfo?id=${id}`, {
                                                headers: { "Authorization": `Bearer ${adminTokenForList}` }
                                            });
                                            if (infoRes.ok) {
                                                const info = await infoRes.json();
                                                b.objects = info.objects;
                                                b.bytes = info.bytes;
                                                b.quotas = info.quotas;
                                            }
                                        } catch (e) { /* ignore individual failures */ }
                                    }
                                }));
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to enrich bucket list with admin stats:", e);
                    }
                }
                
                result = buckets;
                break;

            case "createBucket":
                if (!params.bucket) throw new Error("Bucket name is required");
                await client.send(new CreateBucketCommand({ Bucket: params.bucket }));
                result = { success: true };
                break;

            case "getBucketInfo":
                // 1. Verify S3 access first (using ListObjects as a lightweight check)
                try {
                    await client.send(new ListObjectsV2Command({ Bucket: params.bucket, MaxKeys: 1 }));
                } catch (e) {
                    throw new Error("Access Denied: You do not have permission to view this bucket.");
                }

                // 2. Use Admin Token to fetch details
                const adminToken = process.env.GARAGE_ADMIN_TOKEN;
                if (!adminToken) {
                    throw new Error("Admin token not configured on server");
                }

                const garageEndpoint = process.env.GARAGE_API_BASE_URL || "http://localhost:3903";
                // We need to find the bucket ID from the alias (params.bucket)
                // Or we can use the alias directly if the API supports it. 
                // Garage API /v2/GetBucketInfo supports globalAlias query param.
                
                const infoRes = await fetch(`${garageEndpoint}/v2/GetBucketInfo?globalAlias=${params.bucket}`, {
                    headers: {
                        "Authorization": `Bearer ${adminToken}`
                    }
                });

                if (!infoRes.ok) {
                    // Try by ID if alias fails, though params.bucket is likely an alias or ID.
                    // If the user passed an ID, we should try ?id=...
                    const infoResId = await fetch(`${garageEndpoint}/v2/GetBucketInfo?id=${params.bucket}`, {
                        headers: {
                            "Authorization": `Bearer ${adminToken}`
                        }
                    });
                    
                    if (!infoResId.ok) {
                         throw new Error("Failed to fetch bucket info from Garage Admin API");
                    }
                    result = await infoResId.json();
                } else {
                    result = await infoRes.json();
                }
                break;

            case "check-permissions":
                const perms = {
                    read: false,
                    write: false,
                    owner: false
                };

                // Optimization: If we have GARAGE_ADMIN_TOKEN, we can get exact permissions
                const adminTokenPerms = process.env.GARAGE_ADMIN_TOKEN;
                if (adminTokenPerms) {
                    try {
                        const garageEndpoint = process.env.GARAGE_API_BASE_URL || "http://localhost:3903";
                        const keyRes = await fetch(`${garageEndpoint}/v2/GetKeyInfo?id=${config.accessKeyId}`, {
                            headers: { "Authorization": `Bearer ${adminTokenPerms}` }
                        });
                        
                        if (keyRes.ok) {
                            const keyData = await keyRes.json();
                            // Find bucket permissions
                            const bucketPerms = keyData.buckets.find((b: any) => 
                                b.id === params.bucket || 
                                b.globalAliases?.includes(params.bucket) ||
                                b.localAliases?.includes(params.bucket)
                            );
                            
                            if (bucketPerms) {
                                result = {
                                    read: bucketPerms.permissions.read,
                                    write: bucketPerms.permissions.write,
                                    owner: bucketPerms.permissions.owner
                                };
                                break; // Exit switch
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to check permissions via Admin API:", e);
                    }
                }
                
                // Check Read (ListObjects)
                try {
                    await client.send(new ListObjectsV2Command({ Bucket: params.bucket, MaxKeys: 1 }));
                    perms.read = true;
                } catch (e) {}

                // Check Owner (GetBucketCors)
                try {
                    await client.send(new GetBucketCorsCommand({ Bucket: params.bucket }));
                    perms.owner = true;
                } catch (e: any) {
                    // If CORS is not configured, it returns NoSuchCORSConfiguration but that means we HAVE permission to check it.
                    // If we don't have permission, it returns AccessDenied.
                    if (e.name === "NoSuchCORSConfiguration") {
                        perms.owner = true;
                    }
                }
                
                // Check Write (PutObject - DryRun is not supported by all S3 impls, and Garage might not support it)
                // We can't easily check write without writing. 
                // However, defaulting to false causes the UI to potentially disable features (if it were to use this flag).
                // It's better to be optimistic and let the actual operation fail if permission is missing.
                perms.write = true;
                
                result = perms;
                break;

            case "list":
                const listCmd = new ListObjectsV2Command({
                    Bucket: params.bucket,
                    Prefix: params.prefix,
                    Delimiter: params.delimiter || "/",
                    MaxKeys: params.maxKeys || 1000,
                    ContinuationToken: params.continuationToken
                });
                const data = await client.send(listCmd);
                // Serialize response to avoid circular refs or complex types if any
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
            
            case "delete":
                const delCmd = new DeleteObjectCommand({
                    Bucket: params.bucket,
                    Key: params.key
                });
                await client.send(delCmd);
                result = { success: true };
                break;
                
            case "presign-get":
                const getCmd = new GetObjectCommand({
                    Bucket: params.bucket,
                    Key: params.key
                });
                // Generate direct S3 URL. 
                // Note: The client must be able to reach s3Endpoint directly.
                // CORS must be configured on the bucket if the domain differs.
                const rawGetUrl = await getSignedUrl(signingClient, getCmd, { expiresIn: 3600 });
                
                // Rewrite to use proxy
                const getUrlObj = new URL(rawGetUrl);
                // Use relative URL to avoid CORS issues when server and client have different origins (e.g. localhost vs IP)
                const proxyGetUrl = "/s3-proxy" + getUrlObj.pathname + getUrlObj.search;
                result = { url: proxyGetUrl };
                break;

            case "presign-put":
                 const putCmd = new PutObjectCommand({
                    Bucket: params.bucket,
                    Key: params.key,
                    ContentType: params.contentType
                });
                // Generate direct S3 URL for upload.
                // This avoids buffering in the Next.js proxy and allows real progress tracking.
                const rawPutUrl = await getSignedUrl(signingClient, putCmd, { expiresIn: 3600 });
                
                // Return raw URL to allow direct upload to S3 (requires CORS)
                // We no longer proxy this request, so the browser will upload directly to the S3 endpoint.
                result = { url: rawPutUrl };
                break;

            case "configure-cors":
                const corsCmd = new PutBucketCorsCommand({
                    Bucket: params.bucket,
                    CORSConfiguration: {
                        CORSRules: [
                            {
                                AllowedHeaders: ["*"],
                                AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                                AllowedOrigins: params.origins || ["*"],
                                ExposeHeaders: ["ETag"],
                                MaxAgeSeconds: 3000
                            }
                        ]
                    }
                });
                await client.send(corsCmd);
                result = { success: true };
                break;

            case "get-cors":
                try {
                    const getCorsCmd = new GetBucketCorsCommand({
                        Bucket: params.bucket
                    });
                    const corsData = await client.send(getCorsCmd);
                    result = { rules: corsData.CORSRules };
                } catch (e: any) {
                    if (e.name === 'NoSuchCORSConfiguration') {
                        result = { rules: null };
                    } else {
                        throw e;
                    }
                }
                break;

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("S3 Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
