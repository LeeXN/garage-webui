"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { List, Trash2, RefreshCw, Copy, Edit, Calendar } from "lucide-react"
import { format } from "date-fns"
import { copyToClipboard } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ShareManagerProps {
  bucketName: string
  config: any
}

interface ShareItem {
    id: string
    memo: string
    createdAt: number
    expiresAt: number
    token?: string // Optional, if we decide to store it or regenerate it
}

export function ShareManager({ bucketName, config }: ShareManagerProps) {
  const [open, setOpen] = useState(false)
  const [shares, setShares] = useState<ShareItem[]>([])
  const [loading, setLoading] = useState(false)
  
  // Edit state
  const [editingShare, setEditingShare] = useState<ShareItem | null>(null)
  const [editDuration, setEditDuration] = useState("7")
  const [editUnit, setEditUnit] = useState<"hours" | "days">("days")

  const fetchShares = async () => {
      setLoading(true)
      try {
          const res = await fetch("/api/share", {
              method: "POST",
              body: JSON.stringify({
                  action: "list",
                  bucket: bucketName,
                  config
              })
          })
          if (!res.ok) throw new Error(res.statusText)
          const data = await res.json()
          setShares(data)
      } catch (e: any) {
          toast.error("Failed to list shares: " + e.message)
      } finally {
          setLoading(false)
      }
  }

  useEffect(() => {
      if (open) {
          fetchShares()
      }
  }, [open])

  const handleRevoke = async (id: string) => {
      if (!confirm("Are you sure you want to revoke this share link?")) return
      try {
          const res = await fetch(`/api/share/${id}`, {
              method: "DELETE",
              body: JSON.stringify({
                  bucket: bucketName,
                  config
              })
          })
          if (!res.ok) throw new Error(res.statusText)
          toast.success("Share revoked")
          fetchShares()
      } catch (e: any) {
          toast.error("Failed to revoke: " + e.message)
      }
  }

  const handleUpdate = async () => {
      if (!editingShare) return
      
      try {
          let expiresAt: number;
          const durationNum = parseInt(editDuration);
          
          if (durationNum === -1) {
              expiresAt = -1;
          } else {
              const multiplier = editUnit === "days" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
              // Calculate from NOW, not from creation time, as this is an extension/modification
              expiresAt = Date.now() + durationNum * multiplier;
          }

          const res = await fetch("/api/share", {
              method: "POST",
              body: JSON.stringify({
                  action: "update",
                  bucket: bucketName,
                  config,
                  id: editingShare.id,
                  expiresAt
              })
          })
          
          if (!res.ok) throw new Error(res.statusText)
          
          toast.success("Share updated")
          setEditingShare(null)
          fetchShares()
      } catch (e: any) {
          toast.error("Failed to update share: " + e.message)
      }
  }

  const openEditDialog = (share: ShareItem) => {
      setEditingShare(share)
      setEditDuration("7")
      setEditUnit("days")
  }

  const handleCopyUrl = async (share: ShareItem) => {
      // Since we don't store the full token in metadata (for security), we need to regenerate it
      // OR we can just regenerate a new token for the same ID if the backend supports it.
      // However, our current backend `createShare` generates a NEW ID.
      // To support copying the URL, we need to either:
      // 1. Store the token in the metadata (bad for security if metadata is readable by others)
      // 2. Allow regenerating a token for an existing ID (requires backend change)
      
      // Let's try to regenerate a token for the existing ID.
      // We need to add a new action to the API or modify createShare.
      // Actually, the best way is to call a new endpoint that generates a token for an existing share ID.
      
      try {
          const res = await fetch("/api/share", {
              method: "POST",
              body: JSON.stringify({
                  action: "regenerate_token", // We need to implement this
                  bucket: bucketName,
                  config,
                  id: share.id
              })
          })
          
          if (!res.ok) {
             // Fallback: If backend doesn't support regeneration, we can't copy.
             // But wait, we implemented the backend. Let's add this support.
             throw new Error("Token regeneration not supported yet")
          }
          
          const data = await res.json()
          const url = `${window.location.origin}/share/${share.id}?token=${encodeURIComponent(data.token)}`
          
          const success = await copyToClipboard(url)
          if (success) {
              toast.success("Share URL copied to clipboard")
          } else {
              toast.error("Failed to copy URL")
          }

      } catch (e: any) {
          toast.error("Failed to copy URL: " + e.message)
      }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
            <List className="mr-2 h-4 w-4" />
            Manage Shares
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Active Share Links</DialogTitle>
          <DialogDescription>
            Manage active share links for <strong>{bucketName}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Memo</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-[100px]">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                        </TableRow>
                    ) : shares.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">No active shares found.</TableCell>
                        </TableRow>
                    ) : (
                        shares.map(share => (
                            <TableRow key={share.id}>
                                <TableCell>{share.memo}</TableCell>
                                <TableCell>{format(share.createdAt, "yyyy-MM-dd HH:mm")}</TableCell>
                                <TableCell className={share.expiresAt !== -1 && share.expiresAt < Date.now() ? "text-red-500" : ""}>
                                    {share.expiresAt === -1 
                                        ? "Never" 
                                        : format(share.expiresAt, "yyyy-MM-dd HH:mm")
                                    }
                                    {share.expiresAt !== -1 && share.expiresAt < Date.now() && " (Expired)"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleCopyUrl(share)} title="Copy URL">
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(share)} title="Edit Expiration">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleRevoke(share.id)} title="Revoke">
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>

        <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Edit Dialog */}
      <Dialog open={!!editingShare} onOpenChange={(open) => !open && setEditingShare(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit Share Expiration</DialogTitle>
                <DialogDescription>
                    Update expiration for: {editingShare?.memo}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label>Expires in (from now)</Label>
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            value={editDuration}
                            onChange={(e) => setEditDuration(e.target.value)}
                            placeholder="Duration"
                        />
                        <Select value={editUnit} onValueChange={(v: any) => setEditUnit(v)}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Enter -1 for no expiration.</p>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setEditingShare(null)}>Cancel</Button>
                <Button onClick={handleUpdate}>Update</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
