"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useBuckets, useKeyInfo, useAllowBucketKey, useDenyBucketKey } from "@/hooks/use-garage"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface KeyPermissionsDialogProps {
  keyId: string
  keyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyPermissionsDialog({ keyId, keyName, open, onOpenChange }: KeyPermissionsDialogProps) {
  const { data: buckets } = useBuckets()
  const { data: keyInfo, isLoading } = useKeyInfo(keyId)
  const allowKey = useAllowBucketKey()
  const denyKey = useDenyBucketKey()

  const handlePermissionChange = async (bucketId: string, type: 'read' | 'write' | 'owner', checked: boolean) => {
    if (!keyInfo) return

    // Find current permissions for this bucket
    const currentBucketPerms = keyInfo.buckets.find(b => b.id === bucketId)?.permissions || { read: false, write: false, owner: false }
    
    const newPerms = { ...currentBucketPerms, [type]: checked }
    
    try {
        // If all permissions are removed, we should revoke the key for this bucket
        if (!newPerms.read && !newPerms.write && !newPerms.owner) {
            await denyKey.mutateAsync({
                bucketId,
                accessKeyId: keyId,
                permissions: { read: true, write: true, owner: true }
            })
        } else {
            await allowKey.mutateAsync({
                bucketId,
                accessKeyId: keyId,
                permissions: newPerms
            })
        }
        toast.success("Permissions updated")
    } catch (e) {
        toast.error("Failed to update permissions")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Permissions for {keyName}</DialogTitle>
          <DialogDescription>
            Configure which buckets this key can access and what operations it can perform.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
        ) : (
            <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 font-medium text-sm text-muted-foreground border-b pb-2">
                    <div className="col-span-6">Bucket</div>
                    <div className="col-span-2 text-center">Read</div>
                    <div className="col-span-2 text-center">Write</div>
                    <div className="col-span-2 text-center">Owner</div>
                </div>
                {buckets?.map((bucket: any) => {
                    const keyBucketInfo = keyInfo?.buckets.find((b: any) => b.id === bucket.id)
                    const perms = keyBucketInfo?.permissions || { read: false, write: false, owner: false }
                    
                    return (
                        <div key={bucket.id} className="grid grid-cols-12 gap-4 items-center py-2 border-b last:border-0 hover:bg-muted/50 px-2 rounded">
                            <div className="col-span-6">
                                <div className="font-medium">{bucket.globalAliases?.[0] || bucket.id.substring(0, 12)}</div>
                                <div className="text-xs text-muted-foreground font-mono">{bucket.id}</div>
                            </div>
                            <div className="col-span-2 flex justify-center">
                                <input 
                                    type="checkbox" 
                                    checked={perms.read} 
                                    onChange={(e) => handlePermissionChange(bucket.id, 'read', e.target.checked)} 
                                    className="h-4 w-4 accent-primary" 
                                    disabled={allowKey.isPending || denyKey.isPending}
                                />
                            </div>
                            <div className="col-span-2 flex justify-center">
                                <input 
                                    type="checkbox" 
                                    checked={perms.write} 
                                    onChange={(e) => handlePermissionChange(bucket.id, 'write', e.target.checked)} 
                                    className="h-4 w-4 accent-primary"
                                    disabled={allowKey.isPending || denyKey.isPending}
                                />
                            </div>
                            <div className="col-span-2 flex justify-center">
                                <input 
                                    type="checkbox" 
                                    checked={perms.owner} 
                                    onChange={(e) => handlePermissionChange(bucket.id, 'owner', e.target.checked)} 
                                    className="h-4 w-4 accent-primary"
                                    disabled={allowKey.isPending || denyKey.isPending}
                                />
                            </div>
                        </div>
                    )
                })}
                {buckets?.length === 0 && <div className="text-center text-muted-foreground py-4">No buckets found.</div>}
            </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
