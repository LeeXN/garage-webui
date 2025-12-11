"use client"

import { useKeyInfo, useUpdateKey, useBuckets, useAllowBucketKey, useDenyBucketKey } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { useState, useEffect } from "react"

export default function KeySettingsPage() {
  const params = useParams()
  const keyId = params.keyId as string
  
  const { data: key, isLoading } = useKeyInfo(keyId)
  const { data: allBuckets } = useBuckets()
  const updateKey = useUpdateKey()
  const allowKey = useAllowBucketKey()
  const denyKey = useDenyBucketKey()

  const [name, setName] = useState("")
  
  useEffect(() => {
    if (key) {
      setName(key.name || "")
    }
  }, [key])

  if (isLoading) return <div>Loading...</div>
  if (!key) return <div>Key not found</div>

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateKey.mutateAsync({
        accessKeyId: key.accessKeyId,
        name
      })
      toast.success("Key name updated")
    } catch (error: any) {
      toast.error(error.message || "Failed to update key name")
    }
  }

  const handleCreateBucketPerm = async (checked: boolean) => {
    try {
      await updateKey.mutateAsync({
        accessKeyId: key.accessKeyId,
        allow: checked ? { createBucket: true } : undefined,
        deny: !checked ? { createBucket: true } : undefined
      })
      toast.success(`Create Bucket permission ${checked ? 'granted' : 'revoked'}`)
    } catch (error: any) {
      toast.error(error.message || "Failed to update permission")
    }
  }

  const handlePermissionChange = async (bucketId: string, type: 'read' | 'write' | 'owner', checked: boolean) => {
    if (!key) return

    // Find current permissions for this bucket from the key info
    const currentBucketPerms = key.buckets.find(b => b.id === bucketId)?.permissions || { read: false, write: false, owner: false }
    
    const newPerms = { ...currentBucketPerms, [type]: checked }
    
    try {
        if (checked) {
            await allowKey.mutateAsync({
                bucketId,
                accessKeyId: key.accessKeyId,
                permissions: { [type]: true }
            })
        } else {
            await denyKey.mutateAsync({
                bucketId,
                accessKeyId: key.accessKeyId,
                permissions: { [type]: true }
            })
        }
        toast.success("Permissions updated")
    } catch (e: any) {
        toast.error(e.message || "Failed to update permissions")
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Key Settings: {key.name || key.accessKeyId}</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleUpdateName} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <div className="flex gap-2">
                    <Input 
                    id="name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    />
                    <Button type="submit"><Save className="w-4 h-4" /></Button>
                </div>
              </div>
            </form>
            <div className="space-y-2">
              <Label>Access Key ID</Label>
              <div className="font-mono text-sm bg-muted p-2 rounded">{key.accessKeyId}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="create-bucket">Allow Create Bucket</Label>
              <Switch 
                id="create-bucket" 
                checked={key.permissions.createBucket}
                onCheckedChange={handleCreateBucketPerm}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bucket Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 p-4 bg-muted/50 rounded-lg text-sm space-y-1">
            <div className="font-medium mb-2">Permission Levels:</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><span className="font-semibold">Read:</span> List objects & download files</div>
              <div><span className="font-semibold">Write:</span> Upload & delete objects</div>
              <div><span className="font-semibold">Owner:</span> Manage bucket config (CORS, Quotas)</div>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-center w-[100px]">Read</TableHead>
                <TableHead className="text-center w-[100px]">Write</TableHead>
                <TableHead className="text-center w-[100px]">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBuckets?.map((bucket: any) => {
                const keyBucketInfo = key.buckets.find(b => b.id === bucket.id)
                const perms = keyBucketInfo?.permissions || { read: false, write: false, owner: false }
                
                return (
                <TableRow key={bucket.id}>
                  <TableCell>
                    <div className="font-medium">{bucket.globalAliases?.[0] || bucket.id.substring(0, 12)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{bucket.id}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.read} 
                        onChange={(e) => handlePermissionChange(bucket.id, 'read', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.write} 
                        onChange={(e) => handlePermissionChange(bucket.id, 'write', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.owner} 
                        onChange={(e) => handlePermissionChange(bucket.id, 'owner', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                </TableRow>
              )})}
              {allBuckets?.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No buckets found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
