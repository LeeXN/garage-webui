import { NextRequest, NextResponse } from 'next/server';

const GARAGE_API_BASE_URL = process.env.GARAGE_API_BASE_URL || 'http://localhost:3903';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const queryString = req.nextUrl.search;
  
  let baseUrl = GARAGE_API_BASE_URL;
  // Remove trailing slash if present
  if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
  }
  
  const url = `${baseUrl}/${path}${queryString}`;
  
  console.log(`Proxying ${req.method} request to: ${url}`);

  const headers = new Headers(req.headers);

  // Use dedicated metrics token if available and requesting metrics
  if (path === 'metrics' && process.env.GARAGE_METRICS_TOKEN) {
      console.log('Using GARAGE_METRICS_TOKEN for /metrics endpoint');
      headers.set('Authorization', `Bearer ${process.env.GARAGE_METRICS_TOKEN}`);
  }
  
  // Debug log for Auth header
  const auth = headers.get('Authorization');
  if (auth) {
      console.log(`Authorization header present. Length: ${auth.length}`);
      console.log('Value start:', auth.substring(0, 50));
  } else {
      console.log('Authorization header MISSING');
  }

  // Remove headers that might cause issues
  // Remove headers that might cause issues
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length'); // Let fetch calculate it

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;
    
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: body,
    });

    const responseBody = response.status === 204 ? null : await response.arrayBuffer();
    
    const responseHeaders = new Headers(response.headers);
    // CORS headers for the client
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ message: 'Internal Server Error', error: String(error) }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
