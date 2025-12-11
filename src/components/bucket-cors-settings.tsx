"use client"

import { useConfigureCors, useGetCors } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Check, X, AlertTriangle, Key, LogOut } from "lucide-react"
import { S3ConfigDialog } from "@/components/s3-config-dialog"

interface BucketCorsSettingsProps {
    bucketName: string
    initialS3Config?: any
    onConfigChange?: (config: any) => void
    showConnectButton?: boolean
    keyName?: string
}

export function BucketCorsSettings({ bucketName, initialS3Config, onConfigChange, showConnectButton = true, keyName }: BucketCorsSettingsProps) {
  const [s3Config, setS3Config] = useState<any>(initialS3Config)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [allowAllOrigins, setAllowAllOrigins] = useState(true)
  
  const configureCors = useConfigureCors()
  const { data: corsData, isLoading: isCorsLoading } = useGetCors(bucketName, s3Config)

  useEffect(() => {
      if (initialS3Config) {
          setS3Config(initialS3Config)
      }
  }, [initialS3Config])

  const handleLogout = () => {
    // If we are managing local storage for this bucket
    // localStorage.removeItem(`garage_s3_config_${bucketId}`) // We don't have ID here easily if it's alias
    // Let the parent handle storage if needed, or just clear state
    setS3Config(null)
    if (onConfigChange) {
        onConfigChange(null)
    }
    toast.success("S3 Key disconnected")
  }

  const handleConfigureCors = async () => {
    if (!s3Config) {
      toast.error("S3 configuration not found.")
      return
    }
    
    try {
      const origin = window.location.origin
      const origins = allowAllOrigins ? ["*"] : [origin]
      
      await configureCors.mutateAsync({ 
        bucket: bucketName,
        config: s3Config,
        origins
      })
      toast.success("CORS configured successfully")
    } catch (error: any) {
      toast.error(error.message || "Failed to configure CORS")
    }
  }

  return (
    <Card>
        <CardHeader>
        <CardTitle>Web Upload Configuration (CORS)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        {showConnectButton && (
            <>
                <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200 flex gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Requires Owner Permission</p>
                        <p>Configuring CORS requires an S3 Access Key with <strong>Owner</strong> permission on this bucket.</p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded bg-muted/30">
                    <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div className="text-sm">
                            <span className="text-muted-foreground">S3 Connection: </span>
                            {s3Config ? (
                                <span className="font-mono font-medium">
                                    {keyName ? `${keyName} (${s3Config.accessKeyId})` : s3Config.accessKeyId}
                                </span>
                            ) : (
                                <span className="text-muted-foreground italic">Not connected</span>
                            )}
                        </div>
                    </div>
                    {s3Config ? (
                        <Button variant="outline" size="sm" onClick={handleLogout}>
                            <LogOut className="h-3 w-3 mr-2" /> Disconnect
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(true)}>
                            Connect Key
                        </Button>
                    )}
                </div>
            </>
        )}

        <p className="text-sm text-muted-foreground">
            Configure Cross-Origin Resource Sharing (CORS) to allow web browsers to upload files directly to this bucket.
        </p>
        
        <div className="rounded-md border p-4 bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Current Status</h4>
            {isCorsLoading ? (
                <div className="text-sm text-muted-foreground">Loading configuration...</div>
            ) : corsData?.rules ? (
                <div className="space-y-2">
                    <div className="flex items-center text-sm text-green-600">
                        <Check className="w-4 h-4 mr-2" /> CORS is configured
                    </div>
                    <div className="text-xs font-mono bg-background p-2 rounded border overflow-auto max-h-[200px]">
                        <pre>{JSON.stringify(corsData.rules, null, 2)}</pre>
                    </div>
                </div>
            ) : (
                <div className="flex items-center text-sm text-yellow-600">
                    <X className="w-4 h-4 mr-2" /> CORS is not configured
                </div>
            )}
        </div>

        <div className="space-y-4 pt-2">
            <h4 className="text-sm font-medium">Configure New Policy</h4>
            <div className="flex items-center space-x-2">
                <Switch 
                    id="allow-all" 
                    checked={allowAllOrigins}
                    onCheckedChange={setAllowAllOrigins}
                />
                <Label htmlFor="allow-all">Allow all origins (Recommended for public web access)</Label>
            </div>
            {!allowAllOrigins && (
                <div className="text-sm text-muted-foreground pl-12">
                    Will only allow origin: <code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}</code>
                </div>
            )}
            
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-3 rounded border border-blue-200 dark:border-blue-800">
                <p className="font-semibold mb-1">This will apply the following policy:</p>
                <ul className="list-disc list-inside space-y-1">
                    <li>Allowed Origins: {allowAllOrigins ? "*" : (typeof window !== 'undefined' ? window.location.origin : 'Current Origin')}</li>
                    <li>Allowed Methods: GET, PUT, POST, DELETE, HEAD</li>
                    <li>Allowed Headers: *</li>
                    <li>Expose Headers: ETag</li>
                    <li>Max Age: 3000 seconds</li>
                </ul>
            </div>

            <Button onClick={handleConfigureCors} disabled={configureCors.isPending || !s3Config}>
                {configureCors.isPending ? "Applying..." : "Apply Configuration"}
            </Button>
            {!s3Config && (
                <p className="text-xs text-destructive">
                    S3 configuration missing. Please connect a key above.
                </p>
            )}
        </div>

        <S3ConfigDialog 
            open={isConfigOpen} 
            onOpenChange={setIsConfigOpen} 
            onConfigSave={(newConfig) => {
                setS3Config(newConfig)
                if (onConfigChange) {
                    onConfigChange(newConfig)
                }
            }} 
            bucketId={bucketName} // Using name as ID/Alias
        />
        </CardContent>
    </Card>
  )
}
