"use client"

import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Share2, Copy } from "lucide-react"
import { copyToClipboard } from "@/lib/utils"

interface ShareDialogProps {
  bucketName: string
  config: any // S3 Config
}

export function ShareDialog({ bucketName, config }: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [memo, setMemo] = useState("")
  const [duration, setDuration] = useState("7")
  const [unit, setUnit] = useState<"hours" | "days">("days")
  const [generatedUrl, setGeneratedUrl] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!memo) {
        toast.error("Please enter a memo")
        return
    }
    setLoading(true)
    try {
        let expiresAt: number;
        const durationNum = parseInt(duration);
        
        if (durationNum === -1) {
            expiresAt = -1;
        } else {
            const multiplier = unit === "days" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
            expiresAt = Date.now() + durationNum * multiplier;
        }

        const res = await fetch("/api/share", {
            method: "POST",
            body: JSON.stringify({
                action: "create",
                bucket: bucketName,
                config,
                memo,
                expiresAt
            })
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || res.statusText);
        }
        const data = await res.json()
        
        // Construct URL
        const url = `${window.location.origin}/share/${data.id}?token=${encodeURIComponent(data.token)}`
        setGeneratedUrl(url)
        toast.success("Share link created")
    } catch (e: any) {
        toast.error("Failed to create share: " + e.message)
    } finally {
        setLoading(false)
    }
  }

  const handleCopy = async () => {
      const success = await copyToClipboard(generatedUrl)
      if (success) {
          toast.success("Copied to clipboard")
      } else {
          toast.error("Failed to copy. Please copy manually.")
      }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
        setOpen(val)
        if (!val) setGeneratedUrl("") // Reset on close
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Bucket</DialogTitle>
          <DialogDescription>
            Create a read-only share link for <strong>{bucketName}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        {!generatedUrl ? (
            <div className="grid gap-4 py-4">
            <div className="grid gap-2">
                <Label htmlFor="memo">Memo (Description)</Label>
                <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Share with Bob"
                />
            </div>
            <div className="grid gap-2">
                <Label>Expires in</Label>
                <div className="flex gap-2">
                    <Input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="Duration"
                    />
                    <Select value={unit} onValueChange={(v: any) => setUnit(v)}>
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
        ) : (
            <div className="grid gap-4 py-4">
                <div className="flex items-center space-x-2">
                    <Input value={generatedUrl} readOnly />
                    <Button size="icon" onClick={handleCopy}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    {parseInt(duration) === -1 
                        ? "This link will never expire." 
                        : `This link grants read-only access until ${new Date(Date.now() + parseInt(duration) * (unit === "days" ? 24 : 1) * 60 * 60 * 1000).toLocaleString()}.`
                    }
                </p>
            </div>
        )}

        <DialogFooter>
            {!generatedUrl ? (
                <Button onClick={handleCreate} disabled={loading}>
                    {loading ? "Creating..." : "Create Link"}
                </Button>
            ) : (
                <Button onClick={() => setOpen(false)}>Close</Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
