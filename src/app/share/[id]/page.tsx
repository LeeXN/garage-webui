"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Folder, File, Download, Home } from "lucide-react"
import { format } from "date-fns"
import { formatBytes } from "@/lib/utils"

interface S3Object {
  Key: string
  Size: number
  LastModified: string
  ETag: string
}

interface S3Prefix {
  Prefix: string
}

export default function ShareBrowserPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const shareId = params.id as string
  const token = searchParams.get("token")

  const [prefix, setPrefix] = useState("")
  const [objects, setObjects] = useState<S3Object[]>([])
  const [folders, setFolders] = useState<S3Prefix[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [bucketName, setBucketName] = useState("")

  const fetchObjects = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    try {
      const res = await fetch("/api/share/proxy", {
        method: "POST",
        body: JSON.stringify({
          action: "list",
          token,
          params: {
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
      // We don't get bucket name from list response, but we could decode it from token if we wanted to show it.
      // For now, let's just show "Shared Bucket"
      setBucketName("Shared Bucket") 
    } catch (error: any) {
      toast.error("Failed to list objects: " + error.message)
    } finally {
      setIsLoading(false)
    }
  }, [token, prefix])

  useEffect(() => {
    fetchObjects()
  }, [fetchObjects])

  const handleDownload = async (key: string) => {
    try {
      const res = await fetch("/api/share/proxy", {
        method: "POST",
        body: JSON.stringify({
          action: "presign-get",
          token,
          params: { key }
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      
      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = key.split('/').pop() || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      toast.error("Failed to download: " + error.message)
    }
  }

  const breadcrumbs = prefix.split("/").filter(Boolean)

  if (!token) {
      return <div className="p-8 text-center text-red-500">Invalid Share Link: Missing Token</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">{bucketName}</h1>
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
        <Button variant="outline" size="sm" onClick={fetchObjects} disabled={isLoading}>
            Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
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
              {prefix !== "" && (
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => {
                      const parts = prefix.split("/").filter(Boolean)
                      parts.pop()
                      setPrefix(parts.length ? parts.join("/") + "/" : "")
                  }}>
                    <TableCell><Folder className="h-4 w-4" /></TableCell>
                    <TableCell colSpan={4}>..</TableCell>
                  </TableRow>
              )}
              
              {folders.map((folder) => (
                <TableRow 
                    key={folder.Prefix} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setPrefix(folder.Prefix)}
                >
                  <TableCell>
                    <Folder className="h-4 w-4 text-blue-500" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {folder.Prefix.split("/").filter(Boolean).pop()}/
                  </TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>
              ))}

              {objects.map((obj) => (
                <TableRow key={obj.Key}>
                  <TableCell>
                    <File className="h-4 w-4 text-gray-500" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {obj.Key.split("/").pop()}
                  </TableCell>
                  <TableCell>{formatBytes(obj.Size)}</TableCell>
                  <TableCell>
                    {obj.LastModified ? format(new Date(obj.LastModified), "yyyy-MM-dd HH:mm") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(obj.Key)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!isLoading && objects.length === 0 && folders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                    No objects found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
