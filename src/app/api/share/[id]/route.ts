import { NextRequest, NextResponse } from 'next/server';
import { revokeShare, updateShare } from '@/lib/share-service';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { bucket, config } = body;

        if (!config || !bucket) {
            return NextResponse.json({ error: "Missing config or bucket" }, { status: 400 });
        }

        await revokeShare(config, bucket, id);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { bucket, config, expiresAt } = body;

        if (!config || !bucket || !expiresAt) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        await updateShare(config, bucket, id, expiresAt);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
