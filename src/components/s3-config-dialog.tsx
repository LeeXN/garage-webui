"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState, useEffect } from "react"
import { useKeys, useKeyInfo, useAllowBucketKey } from "@/hooks/use-garage"
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

interface S3Config {
  accessKeyId: string
  secretAccessKey: string
}

interface S3ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigSave: (config: S3Config) => void
  bucketId?: string
}

export function S3ConfigDialog({ open, onOpenChange, onConfigSave, bucketId }: S3ConfigDialogProps) {
  const [config, setConfig] = useState<S3Config>({
    accessKeyId: "",
    secretAccessKey: "",
  })
  
  const { data: keys } = useKeys()
  const [selectedKeyId, setSelectedKeyId] = useState<string>("")
  const { data: selectedKeyDetails, isLoading: isLoadingKey } = useKeyInfo(selectedKeyId, true)
  const allowKey = useAllowBucketKey()

  useEffect(() => {
    const key = bucketId ? `garage_s3_config_${bucketId}` : "garage_s3_config"
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        setConfig(JSON.parse(stored))
      } catch (e) {
        // ignore
      }
    } else {
      // Reset config if no stored config found for this bucket
      setConfig({ accessKeyId: "", secretAccessKey: "" })
    }
  }, [bucketId])

  useEffect(() => {
    if (selectedKeyDetails && selectedKeyDetails.secretAccessKey) {
        setConfig(prev => ({
            ...prev,
            accessKeyId: selectedKeyDetails.accessKeyId,
            secretAccessKey: selectedKeyDetails.secretAccessKey || ""
        }))
    }
  }, [selectedKeyDetails])

  const handleSave = () => {
    const key = bucketId ? `garage_s3_config_${bucketId}` : "garage_s3_config"
    localStorage.setItem(key, JSON.stringify(config))
    onConfigSave(config)
    onOpenChange(false)
  }

  const handleGrantAccess = async () => {
    if (!selectedKeyId || !bucketId) return
    try {
        await allowKey.mutateAsync({
            bucketId,
            accessKeyId: selectedKeyId,
            permissions: { read: true, write: true, owner: true }
        })
        toast.success("Access granted to key")
    } catch (e) {
        toast.error("Failed to grant access")
    }
  }

  const hasPermission = bucketId && selectedKeyDetails?.buckets.some(b => 
    (b.id === bucketId || b.globalAliases?.includes(bucketId)) && 
    (b.permissions.owner || (b.permissions.read && b.permissions.write))
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>S3 Connection Settings</DialogTitle>
          <DialogDescription>
            Configure S3 credentials to browse buckets. These are stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Auto-fill from Cluster Key</Label>
            <div className="flex gap-2 items-center">
                <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={selectedKeyId}
                    onChange={(e) => setSelectedKeyId(e.target.value)}
                >
                    <option value="">Select a key...</option>
                    {keys?.map(k => (
                        <option key={k.id} value={k.id}>{k.name || k.id}</option>
                    ))}
                </select>
                {isLoadingKey && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {selectedKeyId && bucketId && selectedKeyDetails && (
                <div className="mt-2">
                    {hasPermission ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                            <ShieldCheck className="h-4 w-4" /> Key has access to this bucket
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                            <div className="flex items-center gap-2 text-sm text-yellow-700">
                                <ShieldAlert className="h-4 w-4" /> Key missing permissions
                            </div>
                            <Button size="sm" variant="outline" onClick={handleGrantAccess} disabled={allowKey.isPending}>
                                {allowKey.isPending ? "Granting..." : "Grant Access"}
                            </Button>
                        </div>
                    )}
                </div>
            )}
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or enter manually</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="accessKey">Access Key ID</Label>
            <Input
              id="accessKey"
              value={config.accessKeyId}
              onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="secretKey">Secret Access Key</Label>
            <Input
              id="secretKey"
              type="password"
              value={config.secretAccessKey}
              onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!config.accessKeyId || !config.secretAccessKey}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
