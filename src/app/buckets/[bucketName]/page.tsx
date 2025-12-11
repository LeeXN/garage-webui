"use client"

import { useParams, useRouter } from "next/navigation"
import { useBucketInfo } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Globe, Shield, HardDrive, FolderOpen, Settings } from "lucide-react"
import Link from "next/link"
import { formatBytes } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"

export default function BucketPage() {
  const { mode } = useAuth()
  const params = useParams()
  const bucketName = params.bucketName as string
  const { data: bucket, isLoading, error } = useBucketInfo(bucketName)
  const router = useRouter()

  if (mode === "S3") {
      return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{bucketName}</h1>
                    <p className="text-muted-foreground font-mono text-sm">S3 Mode</p>
                </div>
                <div className="flex gap-2">
                    <Button asChild>
                        <Link href={`/buckets/${bucketName}/browse`}>
                            <FolderOpen className="mr-2 h-4 w-4" /> Browse Objects
                        </Link>
                    </Button>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Bucket Access</CardTitle>
                    <CardDescription>
                        You are viewing this bucket using S3 credentials. Administrative features are disabled.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Use the <strong>Browse Objects</strong> button to view and manage files in this bucket.</p>
                </CardContent>
            </Card>
        </div>
      )
  }

  if (isLoading) {
    return <BucketSkeleton />
  }

  if (error || !bucket) {
    return (
        <div className="p-8 text-center">
            <h2 className="text-lg font-bold text-destructive">Bucket not found</h2>
            <p className="text-muted-foreground">Could not load bucket information.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push("/buckets")}>
                Back to Buckets
            </Button>
        </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">{bucket.globalAliases[0] || bucket.id.substring(0, 12)}</h1>
            <p className="text-muted-foreground font-mono text-sm">{bucket.id}</p>
        </div>
        <div className="flex gap-2">
            <Button asChild>
                <Link href={`/buckets/${bucketName}/browse`}>
                    <FolderOpen className="mr-2 h-4 w-4" /> Browse Objects
                </Link>
            </Button>
            <Button variant="outline" asChild>
                <Link href={`/buckets/${bucketName}/settings`}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                </Link>
            </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatBytes(bucket.bytes || 0)}</div>
                <p className="text-xs text-muted-foreground">{bucket.objects || 0} Objects</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Website Access</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{bucket.websiteAccess ? "Enabled" : "Disabled"}</div>
                <p className="text-xs text-muted-foreground">Static website hosting</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quotas</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-sm font-medium">
                    Size: {bucket.quotas?.maxSize ? formatBytes(bucket.quotas.maxSize) : "Unlimited"}
                </div>
                <div className="text-sm font-medium">
                    Objects: {bucket.quotas?.maxObjects ? bucket.quotas.maxObjects.toLocaleString() : "Unlimited"}
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Access Keys</CardTitle>
                <CardDescription>Keys with permission to access this bucket</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
                <Link href={`/buckets/${bucketName}/settings`}>
                    <Settings className="mr-2 h-4 w-4" /> Manage Access
                </Link>
            </Button>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap gap-2">
                {bucket.keys.length === 0 && <span className="text-muted-foreground italic">No keys configured</span>}
                {bucket.keys.map(key => (
                    <Badge key={key.accessKeyId} variant="secondary" className="flex gap-1 items-center">
                        <Shield className="h-3 w-3" />
                        {key.name || key.accessKeyId.substring(0, 8)}
                        <span className="text-[10px] opacity-70 ml-1">
                            ({[key.permissions.read && "R", key.permissions.write && "W", key.permissions.owner && "O"].filter(Boolean).join("")})
                        </span>
                    </Badge>
                ))}
            </div>
        </CardContent>
      </Card>
    </div>
  )
}

function BucketSkeleton() {
    return (
        <div className="space-y-6">
            <div className="h-12 w-1/3 bg-muted animate-pulse rounded" />
            <div className="grid gap-4 md:grid-cols-3">
                <div className="h-32 bg-muted animate-pulse rounded" />
                <div className="h-32 bg-muted animate-pulse rounded" />
                <div className="h-32 bg-muted animate-pulse rounded" />
            </div>
        </div>
    )
}
