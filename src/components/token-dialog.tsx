"use client"

import { useEffect, useState } from "react"
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
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { usePathname } from "next/navigation"

export function TokenDialog({ defaultRegion, defaultEndpoint }: { defaultRegion?: string, defaultEndpoint?: string }) {
  const { isAuthenticated, loginAdmin, loginS3 } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"admin" | "s3">("admin")
  
  // Admin state
  const [token, setToken] = useState("")
  
  // S3 state
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [region, setRegion] = useState(defaultRegion || "garage")
  const [endpoint, setEndpoint] = useState(defaultEndpoint || "http://localhost:3900")

  useEffect(() => {
    if (pathname?.startsWith("/share")) {
        setOpen(false)
        return
    }
    if (!isAuthenticated) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [isAuthenticated, pathname])

  const handleAdminLogin = () => {
    if (!token) return
    const trimmedToken = token.trim()
    if (trimmedToken.startsWith("GET ") || trimmedToken.startsWith("POST ") || trimmedToken.startsWith("http")) {
       if (!window.confirm("The token looks like a command or URL. Are you sure this is your Bearer token?")) {
           return
       }
    }
    loginAdmin(trimmedToken)
    toast.success("Logged in as Admin")
  }

  const handleS3Login = () => {
    if (!accessKeyId || !secretAccessKey) {
      toast.error("Access Key ID and Secret Access Key are required")
      return
    }
    loginS3({
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      region: region.trim(),
      endpoint: endpoint.trim()
    })
    toast.success("Logged in with S3 Credentials")
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
        if (!val && !isAuthenticated) return;
        setOpen(val);
    }}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => {
          if (!isAuthenticated) e.preventDefault()
      }}>
        <DialogHeader>
          <DialogTitle>Authentication Required</DialogTitle>
          <DialogDescription>
            Choose your login method.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Button 
            variant={mode === "admin" ? "default" : "outline"} 
            onClick={() => setMode("admin")}
            className="flex-1"
          >
            Admin Token
          </Button>
          <Button 
            variant={mode === "s3" ? "default" : "outline"} 
            onClick={() => setMode("s3")}
            className="flex-1"
          >
            S3 Credentials
          </Button>
        </div>

        {mode === "admin" ? (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="token">Admin Bearer Token</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                placeholder="eyJhbGciOiJIUzI1Ni..."
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ak">Access Key ID</Label>
              <Input
                id="ak"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="GK..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sk">Secret Access Key</Label>
              <Input
                id="sk"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                type="password"
                placeholder="Enter secret key"
              />
            </div>
             <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="garage"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endpoint">Endpoint</Label>
                  <Input
                    id="endpoint"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://localhost:3900"
                  />
                </div>
             </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={mode === "admin" ? handleAdminLogin : handleS3Login}>
            {mode === "admin" ? "Login as Admin" : "Login with S3"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
