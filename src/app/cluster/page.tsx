"use client"

import { useClusterStatus, useClusterLayout, useApplyClusterLayout, useRevertClusterLayout, useConnectNode, useUpdateNodeRole } from "@/hooks/use-garage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useState } from "react"
import { toast } from "sonner"
import { Server, Activity, Save, RotateCcw, Plus, Edit2, Trash2, Info } from "lucide-react"
import { formatCapacity } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function ClusterPage() {
  const { data: status } = useClusterStatus()
  const { data: layout, isLoading: isLayoutLoading } = useClusterLayout()
  const applyLayout = useApplyClusterLayout()
  const connectNode = useConnectNode()
  const updateNodeRole = useUpdateNodeRole()

  const [newNodeAddr, setNewNodeAddr] = useState("")
  const [editingNode, setEditingNode] = useState<any>(null)
  const [editZone, setEditZone] = useState("")
  const [editCapacity, setEditCapacity] = useState("")
  const [editTags, setEditTags] = useState("")

  const handleConnectNode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNodeAddr) return
    try {
      await connectNode.mutateAsync(newNodeAddr)
      setNewNodeAddr("")
      toast.success("Node connected")
    } catch (error: any) {
      toast.error(error.message || "Failed to connect node")
    }
  }

  const handleApplyLayout = async () => {
    if (!layout) return
    try {
      await applyLayout.mutateAsync(layout.version + 1)
      toast.success("Layout applied")
    } catch (error: any) {
      toast.error(error.message || "Failed to apply layout")
    }
  }

  const openEditDialog = (role: any) => {
    setEditingNode(role)
    setEditZone(role.zone || "")
    setEditCapacity(role.capacity ? (role.capacity / (1024 * 1024 * 1024)).toString() : "")
    setEditTags(role.tags ? role.tags.join(", ") : "")
  }

  const handleUpdateNode = async () => {
    if (!editingNode) return
    try {
      const capacityBytes = editCapacity ? parseFloat(editCapacity) * 1024 * 1024 * 1024 : null
      const tagsList = editTags.split(",").map(t => t.trim()).filter(Boolean)
      
      await updateNodeRole.mutateAsync({
        id: editingNode.id,
        zone: editZone,
        capacity: capacityBytes,
        tags: tagsList
      })
      setEditingNode(null)
      toast.success("Changes staged. Please click 'Apply' to make them effective.")
    } catch (error: any) {
      toast.error(error.message || "Failed to update node role")
    }
  }

  const handleDeleteNode = async (role: any) => {
    if (!confirm(`Are you sure you want to remove node ${role.id} from the layout? This change will be staged.`)) return
    try {
      await updateNodeRole.mutateAsync({
        id: role.id,
        remove: true
      })
      toast.success("Removal staged. Please click 'Apply' to make it effective.")
    } catch (error: any) {
      toast.error(error.message || "Failed to remove node")
    }
  }

  if (isLayoutLoading) return <div>Loading...</div>

  // Merge current roles with staged changes for display
  const displayRoles = layout?.roles.map(role => {
    const staged = layout.stagedRoleChanges?.find((c: any) => c.id === role.id)
    if (staged) {
      if (staged.remove) {
        return { ...role, _status: "removed" }
      }
      return { ...role, ...staged, _status: "modified" }
    }
    return { ...role, _status: "unchanged" }
  }) || []

  layout?.stagedRoleChanges?.forEach((change: any) => {
    if (!displayRoles.find(r => r.id === change.id)) {
        displayRoles.push({ ...change, _status: "added" })
    }
  })

  const roleMap = new Map(displayRoles.map(r => [r.id, r]))
  const statusMap = new Map(status?.nodes.map(n => [n.id, n]) || [])
  const allNodeIds = Array.from(new Set([...roleMap.keys(), ...statusMap.keys()]))

  const mergedNodes = allNodeIds.map(id => {
    const statusNode = statusMap.get(id)
    const roleNode = roleMap.get(id)

    return {
      id,
      hostname: statusNode?.hostname || "-",
      addr: statusNode?.addr || "-",
      isUp: statusNode?.isUp,
      zone: roleNode?.zone || "",
      capacity: roleNode?.capacity,
      tags: roleNode?.tags || [],
      _status: roleNode?._status || "unchanged",
      hasRole: !!roleNode,
      // Add missing fields for table consistency
      partitions: statusNode?.partitions,
      dataPartition: statusNode?.dataPartition
    }
  }).sort((a, b) => {
      if (a._status !== 'unchanged' && b._status === 'unchanged') return -1
      if (a._status === 'unchanged' && b._status !== 'unchanged') return 1
      return a.id.localeCompare(b.id)
  })

  const garageVersion = status?.nodes?.[0]?.garageVersion || "-"
  const dbEngine = status?.nodes?.[0]?.dbEngine || "-"
  
  // Use the calculated redundancy (replication factor) from status
  let redundancyDisplay = status?.redundancy ? status.redundancy.toString() : "-"
  let redundancyTooltip = `Data is replicated ${status?.redundancy || 3} times.`

  // Add policy details to tooltip if available
  if (layout?.parameters?.zoneRedundancy) {
      const zr = layout.parameters.zoneRedundancy
      if (typeof zr === 'object' && 'atLeast' in zr) {
          redundancyTooltip += ` (Policy: At least ${zr.atLeast} zones)`
      } else if (zr === 'maximum') {
          redundancyTooltip += ` (Policy: All available zones)`
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Cluster Management</h1>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Layout Version</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{layout?.version}</div>
            <p className="text-xs text-muted-foreground">
              {layout?.stagedRoleChanges ? "Changes staged" : "No staged changes"}
            </p>
          </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Nodes</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{status?.nodes.length || 0}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Garage Version</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{garageVersion}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DB Engine</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{dbEngine}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Redundancy</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="text-2xl font-bold capitalize cursor-help underline decoration-dotted underline-offset-4">{redundancyDisplay}</div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{redundancyTooltip}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Connect Node</CardTitle>
            <CardDescription>Add a new node to the cluster by its address (e.g. 127.0.0.1:3901)</CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={handleConnectNode} className="flex gap-4 items-end">
                <div className="grid gap-2 flex-1">
                    <Label htmlFor="node-addr">Node Address</Label>
                    <Input 
                        id="node-addr" 
                        placeholder="IP:Port" 
                        value={newNodeAddr}
                        onChange={(e) => setNewNodeAddr(e.target.value)}
                    />
                </div>
                <Button type="submit"><Plus className="w-4 h-4 mr-2" /> Connect</Button>
            </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cluster Nodes</CardTitle>
          <Button onClick={handleApplyLayout} disabled={!layout?.stagedRoleChanges}>
            <Save className="w-4 h-4 mr-2" /> Apply Changes
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Partitions</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergedNodes.map((node) => (
                <TableRow key={node.id} className={node._status === 'modified' ? 'bg-yellow-500/10' : node._status === 'added' ? 'bg-green-500/10' : node._status === 'removed' ? 'bg-red-500/10 opacity-50' : ''}>
                  <TableCell className="font-mono text-xs">
                    {node.id.substring(0, 16)}...
                    {node._status !== 'unchanged' && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-5">
                            {node._status}
                        </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{node.hostname}</div>
                    <div className="text-xs text-muted-foreground">{node.addr}</div>
                  </TableCell>
                  <TableCell>{node.zone || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                        {node.tags?.map((tag, i) => (
                            <span key={tag} className="text-xs">
                                {tag}{i < (node.tags?.length || 0) - 1 ? ", " : ""}
                            </span>
                        )) || "-"}
                    </div>
                  </TableCell>
                  <TableCell>{node.partitions !== undefined ? node.partitions : "-"}</TableCell>
                  <TableCell>{node.capacity ? formatCapacity(node.capacity) : "-"}</TableCell>
                  <TableCell>{node.dataPartition ? formatCapacity(node.dataPartition.total - node.dataPartition.available) : "-"}</TableCell>
                  <TableCell>{node.dataPartition ? formatCapacity(node.dataPartition.available) : "-"}</TableCell>
                  <TableCell>
                    {node.isUp !== undefined && (
                        <Badge variant={node.isUp ? "default" : "destructive"}>
                            {node.isUp ? "Up" : "Down"}
                        </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(node)}>
                            <Edit2 className="h-4 w-4" />
                        </Button>
                        {node.hasRole && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteNode(node)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingNode} onOpenChange={(open) => !open && setEditingNode(null)}>
        <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
                <DialogTitle>Edit Node Role</DialogTitle>
                <DialogDescription className="break-all">
                    Configure zone, capacity and tags for node {editingNode?.id}.
                    <br />
                    <strong>Note:</strong> Changes will be staged. You must click 'Apply Changes' in the Layout section to make them effective.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="zone" className="text-right">Zone</Label>
                    <Input id="zone" value={editZone} onChange={(e) => setEditZone(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="capacity" className="text-right">Capacity (GB)</Label>
                    <Input id="capacity" type="number" value={editCapacity} onChange={(e) => setEditCapacity(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="tags" className="text-right">Tags</Label>
                    <div className="col-span-3 space-y-1">
                        <Input id="tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="ssd, fast, eu-west" />
                        <p className="text-[10px] text-muted-foreground">Separate multiple tags with commas</p>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setEditingNode(null)}>Cancel</Button>
                <Button onClick={handleUpdateNode}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
