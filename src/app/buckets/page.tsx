"use client"

import { useBuckets, useCreateBucket, useDeleteBucket } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState, useEffect } from "react"
import { Trash2, Plus, Settings, FolderOpen } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { formatBytes } from "@/lib/utils"

interface S3BucketInfo {
    id: string
    globalAliases: string[]
    localAliases: string[]
    websiteAccess: boolean
    quotas: {
        maxSize: number | null
        maxObjects: number | null
    }
    objects: number
    bytes: number
}

export default function BucketsPage() {
  const { mode, s3Credentials } = useAuth()
  
  // Admin Mode Hooks
  const { data: adminBuckets, isLoading: adminLoading } = useBuckets()
  const createBucket = useCreateBucket()
  const deleteBucket = useDeleteBucket()
  
  // S3 Mode State
  const [s3Buckets, setS3Buckets] = useState<S3BucketInfo[]>([])
  const [s3Loading, setS3Loading] = useState(false)
  const [canCreateBucket, setCanCreateBucket] = useState(false)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newBucketAlias, setNewBucketAlias] = useState("")

  useEffect(() => {
      if (mode === "S3" && s3Credentials) {
          const fetchS3Buckets = async () => {
              setS3Loading(true)
              try {
                  const res = await fetch("/api/s3", {
                      method: "POST",
                      body: JSON.stringify({
                          action: "listBuckets",
                          config: s3Credentials
                      })
                  })
                  
                  if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      throw new Error(err.error || res.statusText)
                  }

                  const data = await res.json()
                  
                  const mappedBuckets: S3BucketInfo[] = (data || []).map((b: any) => ({
                      id: b.name || "", 
                      globalAliases: [b.name || ""],
                      localAliases: [],
                      websiteAccess: false, 
                      quotas: b.quotas || { maxSize: null, maxObjects: null }, 
                      objects: b.objects || 0, 
                      bytes: b.bytes || 0 
                  }))
                  setS3Buckets(mappedBuckets)
              } catch (e: any) {
                  toast.error("Failed to list buckets: " + e.message)
              } finally {
                  setS3Loading(false)
              }
          }
          
          const checkPermissions = async () => {
              try {
                  const res = await fetch("/api/s3", {
                      method: "POST",
                      body: JSON.stringify({
                          action: "getKeyPermissions",
                          config: s3Credentials
                      })
                  })
                  if (res.ok) {
                      const data = await res.json()
                      setCanCreateBucket(data.createBucket)
                  }
              } catch (e) {
                  console.warn("Failed to check create bucket permission", e)
              }
          }

          fetchS3Buckets()
          checkPermissions()
      }
  }, [mode, s3Credentials])

  const handleCreate = async () => {
    try {
      if (mode === "S3") {
          const res = await fetch("/api/s3", {
              method: "POST",
              body: JSON.stringify({
                  action: "createBucket",
                  config: s3Credentials,
                  params: { bucket: newBucketAlias }
              })
          })
          if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err.error || res.statusText)
          }
          // Refresh S3 buckets
          window.location.reload() // Simple reload for now, or refetch
      } else {
          await createBucket.mutateAsync({ alias: newBucketAlias })
      }
      setIsCreateOpen(false)
      setNewBucketAlias("")
      toast.success("Bucket created")
    } catch (error: any) {
      toast.error(error.message || "Failed to create bucket")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bucket?")) return
    try {
      await deleteBucket.mutateAsync(id)

      toast.success("Bucket deleted")
    } catch (error: any) {
      toast.error(error.message || "Failed to delete bucket")
    }
  }

  const displayBuckets = mode === "S3" ? s3Buckets : adminBuckets
  const isLoading = mode === "S3" ? s3Loading : adminLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Buckets</h1>
        {(mode === "ADMIN" || (mode === "S3" && canCreateBucket)) && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
                <Button>
                <Plus className="mr-2 h-4 w-4" /> Create Bucket
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                <DialogTitle>Create Bucket</DialogTitle>
                <DialogDescription>
                    Enter a global alias for the new bucket.
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="alias" className="text-right">
                    Alias
                    </Label>
                    <Input
                    id="alias"
                    value={newBucketAlias}
                    onChange={(e) => setNewBucketAlias(e.target.value)}
                    className="col-span-3"
                    />
                </div>
                </div>
                <DialogFooter>
                <Button onClick={handleCreate} disabled={createBucket.isPending}>
                    Create
                </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name / ID</TableHead>
              {mode === "ADMIN" && <TableHead>Global Aliases</TableHead>}
              <TableHead>Objects</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                <TableRow>
                    <TableCell colSpan={mode === "ADMIN" ? 5 : 4} className="text-center">Loading...</TableCell>
                </TableRow>
            ) : displayBuckets?.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={mode === "ADMIN" ? 5 : 4} className="text-center text-muted-foreground">No buckets found.</TableCell>
                </TableRow>
            ) : (
                displayBuckets?.map((bucket: any) => (
                <TableRow key={bucket.id}>
                    <TableCell className="font-mono text-xs">
                    <Link href={`/buckets/${bucket.globalAliases?.[0] || bucket.id}`} className="hover:underline text-primary">
                        {mode === "S3" ? bucket.id : `${bucket.id.substring(0, 16)}...`}
                    </Link>
                    </TableCell>
                    {mode === "ADMIN" && <TableCell>{bucket.globalAliases?.join(", ") || "-"}</TableCell>}
                    <TableCell>
                    <div className="flex flex-col gap-1">
                        <span>{bucket.objects ?? 0} {bucket.quotas?.maxObjects ? `/ ${bucket.quotas.maxObjects}` : ""}</span>
                        {bucket.quotas?.maxObjects && (
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                            className="h-full bg-primary" 
                            style={{ width: `${Math.min(100, ((bucket.objects || 0) / bucket.quotas.maxObjects) * 100)}%` }}
                            />
                        </div>
                        )}
                    </div>
                    </TableCell>
                    <TableCell>
                    <div className="flex flex-col gap-1">
                        <span>{bucket.bytes ? formatBytes(bucket.bytes) : "0 B"} {bucket.quotas?.maxSize ? `/ ${formatBytes(bucket.quotas.maxSize)}` : ""}</span>
                        {bucket.quotas?.maxSize && (
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                            className="h-full bg-primary" 
                            style={{ width: `${Math.min(100, ((bucket.bytes || 0) / bucket.quotas.maxSize) * 100)}%` }}
                            />
                        </div>
                        )}
                    </div>
                    </TableCell>
                    <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild title="Browse Objects">
                        <Link href={`/buckets/${bucket.globalAliases?.[0] || bucket.id}/browse`}>
                            <FolderOpen className="h-4 w-4" />
                        </Link>
                        </Button>
                        {mode === "ADMIN" && (
                            <>
                                <Button variant="ghost" size="icon" asChild>
                                <Link href={`/buckets/${bucket.globalAliases?.[0] || bucket.id}/settings`}>
                                    <Settings className="h-4 w-4" />
                                </Link>
                                </Button>
                                <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(bucket.id)}
                                className="text-destructive hover:text-destructive"
                                >
                                <Trash2 className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}


