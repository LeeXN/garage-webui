"use client"

import { useKeys, useCreateKey, useDeleteKey } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { copyToClipboard } from "@/lib/utils"
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
import { useState } from "react"
import { Trash2, Plus, Copy, Settings, Download } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function KeysPage() {
  const { data: keys, isLoading } = useKeys()
  const createKey = useCreateKey()
  const deleteKey = useDeleteKey()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  
  const [createdKey, setCreatedKey] = useState<{ accessKeyId: string, secretAccessKey: string } | null>(null)

  const handleCreate = async () => {
    try {
      const result = await createKey.mutateAsync({ name: newKeyName })
      setCreatedKey({
        accessKeyId: result.accessKeyId,
        secretAccessKey: result.secretAccessKey,
      })
      setIsCreateOpen(false)
      setNewKeyName("")
      toast.success("Key created")
    } catch (error: any) {
      toast.error(error.message || "Failed to create key")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this key?")) return
    try {
      await deleteKey.mutateAsync(id)
      toast.success("Key deleted")
    } catch (error: any) {
      toast.error(error.message || "Failed to delete key")
    }
  }

  const handleCopy = async (text: string, label: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      toast.success(`${label} copied`)
    } else {
      toast.error(`Failed to copy ${label}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Access Keys</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Access Key</DialogTitle>
              <DialogDescription>
                Create a new access key. You can assign permissions later (not implemented in this UI yet).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="col-span-3"
                  placeholder="Optional key name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createKey.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Key Created Successfully</DialogTitle>
            <DialogDescription>
              Please copy your Secret Access Key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Access Key ID</Label>
              <div className="flex items-center gap-2">
                <Input value={createdKey?.accessKeyId} readOnly className="font-mono" />
                <Button size="icon" variant="outline" onClick={() => handleCopy(createdKey?.accessKeyId || "", "Access Key ID")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Secret Access Key</Label>
              <div className="flex items-center gap-2">
                <Input value={createdKey?.secretAccessKey} readOnly className="font-mono" />
                <Button size="icon" variant="outline" onClick={() => handleCopy(createdKey?.secretAccessKey || "", "Secret Key")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="outline" onClick={() => {
                if (!createdKey) return
                const blob = new Blob([JSON.stringify(createdKey, null, 2)], { type: "application/json" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `garage-key-${createdKey.accessKeyId}.json`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                toast.success("Key downloaded")
            }}>
                <Download className="mr-2 h-4 w-4" /> Download JSON
            </Button>
            <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href={`/keys/${createdKey?.accessKeyId}/settings`}>Configure Permissions</Link>
                </Button>
                <Button onClick={() => setCreatedKey(null)}>Done</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Access Key ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys?.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-mono text-xs">{key.id}</TableCell>
                <TableCell>{key.name || "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/keys/${key.id}/settings`}>
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(key.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && keys?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                  No keys found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
