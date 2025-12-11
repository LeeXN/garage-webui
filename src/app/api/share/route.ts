import { NextRequest, NextResponse } from 'next/server';
import { createShare, listShares, regenerateShareToken, updateShare } from '@/lib/share-service';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, bucket, config, memo, expiresAt, id } = body;

        if (!config || !bucket) {
            return NextResponse.json({ error: "Missing config or bucket" }, { status: 400 });
        }

        if (action === 'create') {
            if (!memo || expiresAt === undefined) {
                return NextResponse.json({ error: "Missing memo or expiresAt" }, { status: 400 });
            }
            const result = await createShare(config, bucket, memo, expiresAt);
            return NextResponse.json(result);
        } else if (action === 'update') {
            if (!id || expiresAt === undefined) {
                return NextResponse.json({ error: "Missing id or expiresAt" }, { status: 400 });
            }
            await updateShare(config, bucket, id, expiresAt);
            return NextResponse.json({ success: true });
        } else if (action === 'list') {
            const shares = await listShares(config, bucket);
            return NextResponse.json(shares);
        } else if (action === 'regenerate_token') {
            if (!id) {
                return NextResponse.json({ error: "Missing id" }, { status: 400 });
            }
            const result = await regenerateShareToken(config, bucket, id);
            return NextResponse.json(result);
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (e: any) {
        console.error("Share API error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
