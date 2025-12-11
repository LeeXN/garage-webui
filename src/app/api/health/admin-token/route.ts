import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const adminToken = process.env.GARAGE_ADMIN_TOKEN;
    const garageEndpoint = process.env.GARAGE_API_BASE_URL || "http://localhost:3903";

    if (!adminToken) {
        // Not configured is fine, just means feature is disabled
        return NextResponse.json({ status: "not-configured" });
    }

    try {
        const res = await fetch(`${garageEndpoint}/v2/GetClusterStatus`, {
            headers: {
                "Authorization": `Bearer ${adminToken}`
            }
        });

        if (res.ok) {
            return NextResponse.json({ status: "ok" });
        } else {
            return NextResponse.json({ status: "invalid", error: res.statusText }, { status: 400 });
        }
    } catch (e: any) {
        return NextResponse.json({ status: "error", error: e.message }, { status: 500 });
    }
}
