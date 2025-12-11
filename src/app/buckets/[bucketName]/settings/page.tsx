"use client"

import { useBucketInfo, useUpdateBucket, useAddBucketAlias, useRemoveBucketAlias, useAllowBucketKey, useDenyBucketKey, useKeys } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Trash2, Plus, Save, Edit2, Copy } from "lucide-react"
import { formatBytes } from "@/lib/utils"
import { config } from "@/config"
import { useAuth } from "@/lib/auth-context"
import { BucketCorsSettings } from "@/components/bucket-cors-settings"

export default function BucketSettingsPage() {
  const { mode, s3Credentials } = useAuth()
  const params = useParams()
  const bucketIdOrAlias = params.bucketName as string

  if (mode === "S3") {
      return <S3BucketSettings bucketName={bucketIdOrAlias} s3Credentials={s3Credentials} />
  }

  return <AdminBucketSettings bucketIdOrAlias={bucketIdOrAlias} />
}

function S3BucketSettings({ bucketName, s3Credentials }: { bucketName: string, s3Credentials: any }) {
    const [bucketInfo, setBucketInfo] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (s3Credentials) {
            setLoading(true)
            fetch("/api/s3", {
                method: "POST",
                body: JSON.stringify({
                    action: "getBucketInfo",
                    config: s3Credentials,
                    params: { bucket: bucketName }
                })
            })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => setBucketInfo(data))
            .catch(() => {
                // Ignore errors, likely permission denied or no admin token
            })
            .finally(() => setLoading(false))
        }
    }, [bucketName, s3Credentials])

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Settings: {bucketName}</h1>
            
            {s3Credentials && (
                <Card>
                    <CardHeader>
                        <CardTitle>S3 Credentials</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                            <span className="font-medium text-muted-foreground">Access Key:</span>
                            <code className="font-mono">{s3Credentials.accessKeyId}</code>
                            
                            <span className="font-medium text-muted-foreground">Endpoint:</span>
                            <code className="font-mono">{s3Credentials.endpoint || "Default"}</code>
                            
                            <span className="font-medium text-muted-foreground">Region:</span>
                            <code className="font-mono">{s3Credentials.region || "garage"}</code>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-6">
                <BucketCorsSettings 
                    bucketName={bucketName} 
                    initialS3Config={s3Credentials} 
                    showConnectButton={false} // Already connected via global auth
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Usage & Quotas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-sm text-muted-foreground">Loading usage info...</div>
                        ) : bucketInfo ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label className="text-muted-foreground">Objects</Label>
                                        <div className="text-2xl font-bold">{bucketInfo.objects}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-muted-foreground">Size</Label>
                                        <div className="text-2xl font-bold">{formatBytes(bucketInfo.bytes)}</div>
                                    </div>
                                </div>
                                <div className="space-y-2 pt-4 border-t">
                                    <Label>Quotas</Label>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-muted-foreground">Max Objects:</span>
                                            <span className="ml-2 font-medium">{bucketInfo.quotas?.maxObjects || "Unlimited"}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Max Size:</span>
                                            <span className="ml-2 font-medium">{bucketInfo.quotas?.maxSize ? formatBytes(bucketInfo.quotas.maxSize) : "Unlimited"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Usage information unavailable. (Requires server-side Admin Token)
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function AdminBucketSettings({ bucketIdOrAlias }: { bucketIdOrAlias: string }) {
  const { data: bucket, isLoading } = useBucketInfo(bucketIdOrAlias)
  const updateBucket = useUpdateBucket()
  const addAlias = useAddBucketAlias()
  const removeAlias = useRemoveBucketAlias()
  const allowKey = useAllowBucketKey()
  const denyKey = useDenyBucketKey()
  const { data: allKeys } = useKeys()

  const [s3Config, setS3Config] = useState<any>(null)
  
  useEffect(() => {
    if (!bucket) return
    const stored = localStorage.getItem(`garage_s3_config_${bucket.id}`)
    if (stored) {
      setS3Config(JSON.parse(stored))
    }
  }, [bucket])

  const keyName = allKeys?.find(k => k.id === s3Config?.accessKeyId)?.name

  const handleS3ConfigChange = (newConfig: any) => {
      setS3Config(newConfig)
      if (bucket && newConfig) {
          localStorage.setItem(`garage_s3_config_${bucket.id}`, JSON.stringify(newConfig))
      } else if (bucket) {
          localStorage.removeItem(`garage_s3_config_${bucket.id}`)
      }
  }

  const [newAlias, setNewAlias] = useState("")
  const [newKeyId, setNewKeyId] = useState("")
  const [newKeyPerms, setNewKeyPerms] = useState({ read: true, write: false, owner: false })
  
  // Quotas state
  const [maxSizeValue, setMaxSizeValue] = useState<string>("")
  const [maxSizeUnit, setMaxSizeUnit] = useState<string>("GB")
  
  // Edit Key Dialog
  const [editingKey, setEditingKey] = useState<any>(null)
  const [editKeyPerms, setEditKeyPerms] = useState({ read: false, write: false, owner: false })

  if (isLoading) return <div>Loading...</div>
  if (!bucket) return <div>Bucket not found</div>

  const handleUpdateQuotas = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    
    let maxSize = null
    if (maxSizeValue) {
        const val = parseFloat(maxSizeValue)
        if (!isNaN(val)) {
            const multiplier = maxSizeUnit === "TB" ? 1024 * 1024 * 1024 * 1024 :
                               maxSizeUnit === "GB" ? 1024 * 1024 * 1024 :
                               maxSizeUnit === "MB" ? 1024 * 1024 : 1;
            maxSize = Math.floor(val * multiplier)
        }
    }

    const maxObjects = formData.get("maxObjects") ? Number(formData.get("maxObjects")) : null
    
    try {
      await updateBucket.mutateAsync({
        id: bucket.id,
        quotas: { maxSize, maxObjects }
      })
      toast.success("Quotas updated")
    } catch (error: any) {
      toast.error(error.message || "Failed to update quotas")
    }
  }

  const handleWebsiteToggle = async (checked: boolean) => {
    try {
      await updateBucket.mutateAsync({
        id: bucket.id,
        websiteAccess: checked ? { enabled: true, indexDocument: "index.html", errorDocument: "error.html" } : { enabled: false, indexDocument: undefined, errorDocument: undefined }
      })
      toast.success(`Website access ${checked ? 'enabled' : 'disabled'}`)
    } catch (error: any) {
      toast.error(error.message || "Failed to update website access")
    }
  }

  const handleAddAlias = async () => {
    if (!newAlias) return
    try {
      await addAlias.mutateAsync({ id: bucket.id, alias: newAlias })
      setNewAlias("")
      toast.success("Alias added")
    } catch (error: any) {
      toast.error(error.message || "Failed to add alias")
    }
  }

  const handleRemoveAlias = async (alias: string) => {
    if (!confirm(`Remove alias ${alias}?`)) return
    try {
      await removeAlias.mutateAsync({ id: bucket.id, alias })
      toast.success("Alias removed")
    } catch (error: any) {
      toast.error(error.message || "Failed to remove alias")
    }
  }

  const handlePermissionChange = async (accessKeyId: string, type: 'read' | 'write' | 'owner', checked: boolean) => {
    if (!bucket) return

    try {
        if (checked) {
            await allowKey.mutateAsync({
                bucketId: bucket.id,
                accessKeyId,
                permissions: { [type]: true }
            })
        } else {
            await denyKey.mutateAsync({
                bucketId: bucket.id,
                accessKeyId,
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
      <h1 className="text-3xl font-bold tracking-tight">Settings: {bucket.globalAliases[0] || bucket.id}</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="website-access">Website Access</Label>
                  <Switch 
                    id="website-access" 
                    checked={bucket.websiteAccess}
                    onCheckedChange={handleWebsiteToggle}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bucket ID</Label>
                  <div className="font-mono text-sm bg-muted p-2 rounded">{bucket.id}</div>
                </div>
                {bucket.websiteAccess && (
                  <div className="space-y-2">
                    <Label>Website URL</Label>
                    <div className="font-mono text-sm bg-muted p-2 rounded flex items-center justify-between">
                      <span className="truncate mr-2">http://{bucket.globalAliases?.[0] || bucket.id}{config.garageWebsiteDomain}</span>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={async () => {
                          const url = `http://${bucket.globalAliases?.[0] || bucket.id}${config.garageWebsiteDomain}`;
                          try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(url);
                                toast.success("URL copied to clipboard");
                            } else {
                                throw new Error("Clipboard API not available");
                            }
                          } catch (err) {
                            // Fallback for non-secure contexts
                            const textArea = document.createElement("textarea");
                            textArea.value = url;
                            textArea.style.position = "fixed";
                            textArea.style.left = "-9999px";
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            try {
                                document.execCommand('copy');
                                toast.success("URL copied to clipboard");
                            } catch (e) {
                                toast.error("Failed to copy URL");
                            }
                            document.body.removeChild(textArea);
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Configured domain: <code>{config.garageWebsiteDomain}</code>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quotas</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateQuotas} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="maxSize">Max Size</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="maxSize" 
                            value={maxSizeValue}
                            onChange={(e) => setMaxSizeValue(e.target.value)}
                            type="number" 
                            step="0.1"
                            placeholder={bucket.quotas.maxSize ? formatBytes(bucket.quotas.maxSize) : "Unlimited"}
                        />
                        <Select value={maxSizeUnit} onValueChange={setMaxSizeUnit}>
                            <SelectTrigger className="w-[100px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MB">MB</SelectItem>
                                <SelectItem value="GB">GB</SelectItem>
                                <SelectItem value="TB">TB</SelectItem>
                                <SelectItem value="Bytes">Bytes</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {bucket.quotas.maxSize && (
                        <p className="text-xs text-muted-foreground">Current: {formatBytes(bucket.quotas.maxSize)}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxObjects">Max Objects</Label>
                    <Input 
                      id="maxObjects" 
                      name="maxObjects" 
                      type="number" 
                      defaultValue={bucket.quotas.maxObjects || ""} 
                      placeholder="Unlimited"
                    />
                  </div>
                  <Button type="submit"><Save className="w-4 h-4 mr-2" /> Save Quotas</Button>
                </form>
              </CardContent>
            </Card>
        </div>

        <div className="space-y-6">
            <BucketCorsSettings 
                bucketName={bucket.globalAliases?.[0] || bucket.id} 
                initialS3Config={s3Config}
                onConfigChange={handleS3ConfigChange}
                keyName={keyName}
            />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aliases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              placeholder="New global alias" 
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
            />
            <Button onClick={handleAddAlias}><Plus className="w-4 h-4 mr-2" /> Add</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {bucket.globalAliases.map(alias => (
              <div key={alias} className="flex items-center gap-2 bg-secondary px-3 py-1 rounded-md">
                <span>{alias}</span>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleRemoveAlias(alias)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <TableHead>Key Name</TableHead>
                <TableHead className="text-center w-[100px]">Read</TableHead>
                <TableHead className="text-center w-[100px]">Write</TableHead>
                <TableHead className="text-center w-[100px]">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allKeys?.map((key) => {
                // Check if this key has permissions for the current bucket
                const bucketKeyInfo = bucket.keys.find(k => k.accessKeyId === key.id)
                const perms = bucketKeyInfo?.permissions || { read: false, write: false, owner: false }
                
                return (
                <TableRow key={key.id}>
                  <TableCell>
                    <div className="font-medium">{key.name || "Unnamed Key"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{key.id.substring(0, 12)}...</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.read} 
                        onChange={(e) => handlePermissionChange(key.id, 'read', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.write} 
                        onChange={(e) => handlePermissionChange(key.id, 'write', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                        type="checkbox" 
                        checked={perms.owner} 
                        onChange={(e) => handlePermissionChange(key.id, 'owner', e.target.checked)} 
                        className="h-4 w-4 accent-primary"
                        disabled={allowKey.isPending || denyKey.isPending}
                    />
                  </TableCell>
                </TableRow>
              )})}
              {allKeys?.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No keys found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
