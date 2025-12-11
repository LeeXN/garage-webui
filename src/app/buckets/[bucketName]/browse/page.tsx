"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { S3ConfigDialog } from "@/components/s3-config-dialog"
import { ShareDialog } from "@/components/share-dialog"
import { ShareManager } from "@/components/share-manager"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"
import { Folder, File, Download, Trash2, Upload, Settings, ChevronRight, Home, LogOut, RotateCw } from "lucide-react"
import { format } from "date-fns"
import { formatBytes } from "@/lib/utils"

import { useBucketInfo, useConfigureCors, useKeys } from "@/hooks/use-garage"
import { useAuth } from "@/lib/auth-context"

interface S3Object {
  Key: string
  Size: number
  LastModified: string
  ETag: string
}

interface S3Prefix {
  Prefix: string
}

export default function BucketBrowserPage() {
  const params = useParams()
  const bucketName = params.bucketName as string
  const { data: bucketInfo } = useBucketInfo(bucketName)
  const configureCors = useConfigureCors()
  const { mode, s3Credentials } = useAuth()
  const { data: allKeys } = useKeys()

  const [config, setConfig] = useState<any>(null)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const prefix = searchParams.get("prefix") || ""

  const setPrefix = useCallback((newPrefix: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (newPrefix) {
          params.set("prefix", newPrefix)
      } else {
          params.delete("prefix")
      }
      router.push(`${pathname}?${params.toString()}`)
  }, [searchParams, pathname, router])

  const [objects, setObjects] = useState<S3Object[]>([])
  const [folders, setFolders] = useState<S3Prefix[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  
  const [permissions, setPermissions] = useState({ read: true, write: true, owner: false })

  useEffect(() => {
      if (config && bucketName) {
          const checkPerms = async () => {
              try {
                  const res = await fetch("/api/s3", {
                      method: "POST",
                      body: JSON.stringify({
                          action: "check-permissions",
                          config,
                          params: { bucket: bucketName }
                      })
                  })
                  if (res.ok) {
                      const perms = await res.json()
                      setPermissions(perms)
                  }
              } catch (e) {
                  console.error("Failed to check permissions", e)
              }
          }
          checkPerms()
      }
  }, [config, bucketName])

  useEffect(() => {
    if (mode === "S3" && s3Credentials) {
        setConfig(s3Credentials)
        setIsConfigOpen(false)
        return
    }

    if (!bucketInfo) return
    const stored = localStorage.getItem(`garage_s3_config_${bucketInfo.id}`)
    if (stored) {
      setConfig(JSON.parse(stored))
    } else {
      setIsConfigOpen(true)
    }
  }, [bucketInfo, mode, s3Credentials])

  const fetchObjects = useCallback(async () => {
    if (!config) return
    setIsLoading(true)
    try {
      const res = await fetch("/api/s3", {
        method: "POST",
        body: JSON.stringify({
          action: "list",
          config,
          params: {
            bucket: bucketName,
            prefix,
            delimiter: "/"
          }
        })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || res.statusText);
      }
      const data = await res.json()
      setObjects(data.Contents || [])
      setFolders(data.CommonPrefixes || [])
    } catch (error: any) {
      // If it's an Access Denied error, it might be a Write-Only key.
      // We shouldn't force the config dialog open in this case, just show a warning.
      if (error.message.includes("Access Denied") || error.message.includes("AccessDenied")) {
          toast.warning("Cannot list objects. You might have Write-Only permissions.")
          setObjects([])
          setFolders([])
          return // Don't open config dialog
      }

      toast.error("Failed to list objects: " + error.message)
      if (
        error.message.includes("InvalidAccessKeyId") || 
        error.message.includes("Missing S3 configuration") ||
        error.message.includes("No such key")
      ) {
          setIsConfigOpen(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [config, bucketName, prefix])

  useEffect(() => {
    if (config) {
      fetchObjects()
    }
  }, [config, fetchObjects])

  const handleDownload = async (key: string) => {
    try {
      const res = await fetch("/api/s3", {
        method: "POST",
        body: JSON.stringify({
          action: "presign-get",
          config,
          params: { bucket: bucketName, key }
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      window.open(url, "_blank")
    } catch (error: any) {
      toast.error("Failed to get download URL: " + error.message)
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return
    try {
      const res = await fetch("/api/s3", {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
          config,
          params: { bucket: bucketName, key }
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Object deleted")
      fetchObjects()
    } catch (error: any) {
      toast.error("Failed to delete object: " + error.message)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Dismiss any existing toasts to avoid confusion
    toast.dismiss()
    
    setUploading(true)
    setUploadProgress(0)
    setUploadSpeed(0)

    try {
      // 1. Get presigned PUT URL
      const key = prefix + file.name
      const res = await fetch("/api/s3", {
        method: "POST",
        body: JSON.stringify({
          action: "presign-put",
          config,
          params: { 
            bucket: bucketName, 
            key,
            contentType: file.type || "application/octet-stream"
          }
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()

      // 2. Upload file using XHR for progress
      await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          
          let lastLoaded = 0;
          let lastTime = Date.now();

          xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                  const percentComplete = (event.loaded / event.total) * 100;
                  setUploadProgress(percentComplete);
                  
                  const now = Date.now();
                  const diffTime = now - lastTime;
                  if (diffTime > 500) { // Update speed every 500ms
                      const diffLoaded = event.loaded - lastLoaded;
                      const speed = (diffLoaded / diffTime) * 1000; // bytes per second
                      setUploadSpeed(speed);
                      lastLoaded = event.loaded;
                      lastTime = now;
                  }
              }
          };

          xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
              } else {
                  let errorMessage = `Upload failed with status ${xhr.status}`;
                  if (xhr.responseText) {
                      try {
                          // Try to parse S3 XML error format
                          const parser = new DOMParser();
                          const xmlDoc = parser.parseFromString(xhr.responseText, "text/xml");
                          const message = xmlDoc.getElementsByTagName("Message")[0]?.textContent;
                          const code = xmlDoc.getElementsByTagName("Code")[0]?.textContent;
                          
                          if (message) {
                              errorMessage = message;
                              if (code) errorMessage = `${code}: ${errorMessage}`;
                          } else if (xhr.responseText.length < 500) {
                              // Fallback to raw text if it's short (likely a plain text error)
                              errorMessage = xhr.responseText;
                          }
                      } catch (e) {
                          // If parsing fails, use raw text if short
                          if (xhr.responseText.length < 500) {
                              errorMessage = xhr.responseText;
                          }
                      }
                  }
                  reject(new Error(errorMessage));
              }
          };

          xhr.onerror = () => reject(new Error("Network error during upload. This is likely due to missing CORS configuration or an unreachable S3 endpoint."));
          xhr.send(file);
      });
      
      toast.success("File uploaded")
      fetchObjects()
    } catch (error: any) {
      if (error.message.includes("Network error") || error.message.includes("CORS")) {
          toast.error(
              <div className="flex flex-col gap-2">
                  <span className="font-semibold">Upload Failed: Network Error</span>
                  <span className="text-xs">
                    The browser blocked the request. This usually means:
                    <ul className="list-disc list-inside mt-1">
                        <li>CORS is not configured on the bucket.</li>
                        <li>The S3 endpoint is unreachable from your browser.</li>
                        <li>You are using HTTPS but the S3 endpoint is HTTP (Mixed Content).</li>
                    </ul>
                  </span>
                  <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full bg-destructive/10 hover:bg-destructive/20 border-destructive/50 mt-1"
                      onClick={async () => {
                          try {
                              const origin = window.location.origin
                              const targetBucket = bucketInfo?.globalAliases?.[0] || bucketInfo?.id || bucketName
                              await configureCors.mutateAsync({ 
                                  bucket: targetBucket,
                                  config,
                                  origins: [origin, "*"] 
                              })
                              toast.success("CORS configured! Please try uploading again.")
                          } catch (e: any) {
                              toast.error("Failed to configure CORS: " + e.message)
                          }
                      }}
                  >
                      Fix CORS & Enable Uploads
                  </Button>
              </div>,
              { duration: 10000 }
          )
      } else {
          toast.error("Upload failed: " + error.message)
      }
      
      if (error.message.includes("Missing S3 configuration")) {
          setIsConfigOpen(true)
      }
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setUploadSpeed(0)
      e.target.value = ""
    }
  }

  const navigateToFolder = (folderPrefix: string) => {
    setPrefix(folderPrefix)
  }

  const navigateUp = () => {
    if (!prefix) return
    const parts = prefix.split("/").filter(Boolean)
    parts.pop()
    setPrefix(parts.length ? parts.join("/") + "/" : "")
  }

  const handleLogout = () => {
    if (bucketInfo) {
      localStorage.removeItem(`garage_s3_config_${bucketInfo.id}`)
    }
    setConfig(null)
    setIsConfigOpen(true)
    toast.success("Logged out")
  }
  
  const breadcrumbs = prefix.split("/").filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">Browser: {bucketName}</h1>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <Button variant="ghost" size="sm" className="p-1 h-auto" onClick={() => setPrefix("")}>
                            <Home className="h-4 w-4" />
                        </Button>
                    </BreadcrumbItem>
                    {breadcrumbs.map((part, index) => {
                        const path = breadcrumbs.slice(0, index + 1).join("/") + "/"
                        return (
                            <div key={path} className="flex items-center">
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <Button variant="ghost" size="sm" className="p-1 h-auto" onClick={() => setPrefix(path)}>
                                        {part}
                                    </Button>
                                </BreadcrumbItem>
                            </div>
                        )
                    })}
                </BreadcrumbList>
            </Breadcrumb>
        </div>
        <div className="flex gap-2">
          {mode === "ADMIN" && config && (
            <>
                <ShareDialog bucketName={bucketName} config={config} />
                <ShareManager bucketName={bucketName} config={config} />
            </>
          )}
          {mode !== "S3" && (
            <>
              <Button variant="outline" onClick={handleLogout} title="Logout">
                <LogOut className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
                <Settings className="w-4 h-4 mr-2" /> Connection
              </Button>
            </>
          )}
          {mode === "S3" && permissions.owner && (
              <Button variant="outline" asChild>
                  <Link href={`/buckets/${bucketName}/settings`}>
                      <Settings className="w-4 h-4 mr-2" /> Settings
                  </Link>
              </Button>
          )}
          <Button variant="outline" size="icon" onClick={fetchObjects} title="Refresh">
            <RotateCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <div className="relative">
            <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                onChange={handleUpload}
                disabled={uploading}
            />
            <Button disabled={uploading}>
                <Upload className="w-4 h-4 mr-2" /> {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </div>

      {config && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/30 p-2 rounded border">
              <div className="flex items-center gap-2">
                  <span className="font-medium">Connected as:</span>
                  <code className="bg-muted px-1 rounded">
                    {allKeys?.find(k => k.id === config.accessKeyId)?.name 
                        ? `${allKeys.find(k => k.id === config.accessKeyId)?.name} (${config.accessKeyId})`
                        : config.accessKeyId}
                  </code>
              </div>
              <div className="flex items-center gap-2">
                  <span className="font-medium">Endpoint:</span>
                  <span>{config.endpoint || "Default"}</span>
              </div>
              <div className="flex items-center gap-2">
                  <span className="font-medium">Permissions:</span>
                  <div className="flex gap-1">
                      {permissions.read && <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs px-1.5 py-0.5 rounded">Read</span>}
                      {permissions.write && <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 text-xs px-1.5 py-0.5 rounded">Write</span>}
                      {permissions.owner && <span className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100 text-xs px-1.5 py-0.5 rounded">Owner</span>}
                  </div>
              </div>
          </div>
      )}

      {uploading && (
          <Card className="mb-4">
              <CardContent className="pt-6">
                  <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                          <span>{uploadProgress === 100 ? "Completing..." : "Uploading..."}</span>
                          <span>{uploadProgress.toFixed(1)}% {uploadProgress < 100 && `(${formatBytes(uploadSpeed)}/s)`}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                              className={`h-full bg-primary transition-all duration-300 ease-out ${uploadProgress === 100 ? "animate-pulse" : ""}`}
                              style={{ width: `${uploadProgress}%` }}
                          />
                      </div>
                  </div>
              </CardContent>
          </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prefix && (
                <TableRow className="cursor-pointer hover:bg-muted/50" onClick={navigateUp}>
                  <TableCell><Folder className="h-4 w-4 text-muted-foreground" /></TableCell>
                  <TableCell colSpan={4}>..</TableCell>
                </TableRow>
              )}
              
              {folders.map((folder) => (
                <TableRow key={folder.Prefix} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToFolder(folder.Prefix)}>
                  <TableCell><Folder className="h-4 w-4 text-blue-500" /></TableCell>
                  <TableCell className="font-medium">{folder.Prefix.split("/").filter(Boolean).pop()}/</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>
              ))}

              {objects.map((obj) => (
                <TableRow key={obj.Key}>
                  <TableCell><File className="h-4 w-4 text-gray-500" /></TableCell>
                  <TableCell>{obj.Key.split("/").pop()}</TableCell>
                  <TableCell>{formatBytes(obj.Size)}</TableCell>
                  <TableCell>{obj.LastModified ? format(new Date(obj.LastModified), "yyyy-MM-dd HH:mm:ss") : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleDownload(obj.Key)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {permissions.write && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(obj.Key)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              
              {!isLoading && objects.length === 0 && folders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    No objects found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <S3ConfigDialog 
        open={isConfigOpen} 
        onOpenChange={setIsConfigOpen} 
        onConfigSave={setConfig} 
        bucketId={bucketInfo?.id}
      />
    </div>
  )
}
