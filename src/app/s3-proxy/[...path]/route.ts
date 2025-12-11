import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    
    if (!path || path.length < 2) {
        return new NextResponse("Invalid path", { status: 400 });
    }

    const encodedEndpoint = path[0];
    let endpoint: string;
    try {
        endpoint = Buffer.from(encodedEndpoint, 'base64url').toString('utf-8');
    } catch (e) {
        return new NextResponse("Invalid endpoint encoding", { status: 400 });
    }

    // Reconstruct the path
    // path[0] is endpoint
    // path[1...] is the S3 path (bucket/key)
    const s3Path = path.slice(1).join('/');
    const searchParams = req.nextUrl.search; // Includes ?
    
    // Ensure endpoint doesn't have trailing slash
    const cleanEndpoint = endpoint.replace(/\/$/, '');
    let targetUrl = `${cleanEndpoint}/${s3Path}${searchParams}`;

    // Filter headers
    const headers = new Headers();
    req.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'connection') {
            headers.set(key, value);
        }
    });

    const fetchWithRetry = async (url: string) => {
        try {
            return await fetch(url, {
                method: req.method,
                headers: headers,
                // @ts-ignore
                duplex: 'half', // Required for streaming bodies in some Next.js versions/Node
            });
        } catch (e: any) {
            // Check for connection refused and localhost
            if ((e.cause?.code === 'ECONNREFUSED' || e.message.includes('ECONNREFUSED')) && 
                (url.includes('localhost') || url.includes('127.0.0.1'))) {
                
                console.log(`Proxy connection refused on ${url}, retrying with host.docker.internal`);
                
                // Try replacing localhost with host.docker.internal
                const newUrl = url.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal');
                return await fetch(newUrl, {
                    method: req.method,
                    headers: headers,
                    // @ts-ignore
                    duplex: 'half',
                });
            }
            throw e;
        }
    };

    try {
        const response = await fetchWithRetry(targetUrl);
        
        const newHeaders = new Headers(response.headers);
        // Remove content-encoding if present to avoid double compression issues if we are not decompressing
        // But fetch usually handles decompression transparently.
        // If we stream the body, we should be careful.
        
        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (e: any) {
        console.error("Proxy error:", e);
        return new NextResponse(`Proxy error: ${e.message}`, { status: 502 });
    }
}
