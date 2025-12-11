"use client"

import { useClusterHealth, useClusterStatus, useBuckets } from "@/hooks/use-garage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Activity, HardDrive, Server, Database, RefreshCw, ChevronDown, Box } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"

export default function Dashboard() {
  const { mode } = useAuth()
  const router = useRouter()
  const [refreshInterval, setRefreshInterval] = useState(0)
  const { data: health, isLoading: healthLoading } = useClusterHealth(refreshInterval)
  const { data: status, isLoading: statusLoading } = useClusterStatus(refreshInterval)
  const { data: buckets, isLoading: bucketsLoading } = useBuckets()

  useEffect(() => {
    if (mode === "S3") {
      router.replace("/buckets")
    }
  }, [mode, router])

  if (mode === "S3") {
    return null // Or a loading spinner while redirecting
  }

  const totalCapacity = status?.nodes.reduce((acc, node) => acc + (node.capacity || 0), 0) || 0;
  const totalAvailable = status?.nodes.reduce((acc, node) => {
      // Available is Min(PhysicalAvailable, ConfiguredCapacity - Used)
      const fsTotal = node.dataPartition?.total || 0
      const fsAvailable = node.dataPartition?.available || 0
      const fsUsed = fsTotal - fsAvailable
      
      let displayAvailable = fsAvailable
      if (node.capacity) {
          const remainingQuota = Math.max(0, node.capacity - fsUsed)
          displayAvailable = Math.min(fsAvailable, remainingQuota)
      }
      return acc + displayAvailable
  }, 0) || 0;
  const totalUsed = totalCapacity - totalAvailable;

  // Calculate Usable Capacity based on Zone Distribution
  const redundancy = status?.redundancy || 3;
  
  // Group capacity by zone
  const zoneCapacities: Record<string, number> = {};
  status?.nodes.forEach(node => {
      const zone = node.zone || "default";
      zoneCapacities[zone] = (zoneCapacities[zone] || 0) + (node.capacity || 0);
  });
  
  const zones = Object.keys(zoneCapacities);
  const numZones = zones.length;
  const minZoneCapacity = numZones > 0 ? Math.min(...Object.values(zoneCapacities)) : 0;

  // Formula: Usable = Min(Zone Capacities) * (NumZones / Redundancy)
  // This assumes Garage balances data across zones.
  // If NumZones < Redundancy, we can't satisfy the constraint properly (or we are degraded).
  let effectiveUsableCapacity = 0;
  if (numZones >= redundancy && redundancy > 0) {
      effectiveUsableCapacity = minZoneCapacity * (numZones / redundancy);
  } else if (redundancy > 0) {
      // Fallback or 0? If we have fewer zones than redundancy, we can't store data with full zone-isolation.
      // But Garage might still work by putting multiple copies in same zone?
      // Usually Garage requires distinct zones for redundancy.
      // We'll show 0 or a warning, but for calculation let's be conservative.
      effectiveUsableCapacity = 0; 
  }

  // Calculate Usable Available based on the same ratio
  // Ratio = EffectiveUsable / TotalRaw
  const efficiencyRatio = totalCapacity > 0 ? effectiveUsableCapacity / totalCapacity : 0;
  const usableAvailable = totalAvailable * efficiencyRatio;

  // Use metrics for storage used if available (more accurate for object data), otherwise fallback to disk usage
  // Actually, disk usage includes overhead, metrics is object size. 
  // The user likely wants to see how much disk is used.
  const displayStorageUsed = totalUsed; 

  if (statusLoading && !status) {
      return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshInterval > 0 ? 'animate-spin' : ''}`} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[120px] justify-between">
                  {refreshInterval === 0 ? "No Refresh" : 
                   refreshInterval === 5000 ? "5s" :
                   refreshInterval === 10000 ? "10s" :
                   refreshInterval === 30000 ? "30s" : "1m"}
                   <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRefreshInterval(0)}>No Refresh</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshInterval(5000)}>5s</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshInterval(10000)}>10s</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshInterval(30000)}>30s</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshInterval(60000)}>1m</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cluster Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
                {status?.nodes.every(n => n.isUp) ? "Healthy" : status?.nodes.some(n => n.isUp) ? "Degraded" : "Unavailable"}
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.nodes.filter(n => n.isUp).length || 0} / {status?.nodes.length || 0} nodes connected
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(displayStorageUsed)}</div>
            <p className="text-xs text-muted-foreground">
              of {formatBytes(totalCapacity)} (Raw)
            </p>
            <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                <div className="flex justify-between">
                    <span>Usable:</span>
                    <span className="font-medium">{formatBytes(usableAvailable)} free</span>
                </div>
                <div className="flex justify-between text-[10px] opacity-70">
                    <span>(approx. {redundancy}x replication)</span>
                </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Buckets</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buckets?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {health?.items || 0} objects
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
            <CardTitle className="text-sm font-medium">Partitions</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.partitions || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nodes</CardTitle>
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
                <TableHead>Total</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {status?.nodes.map((node) => {
                const fsTotal = node.dataPartition?.total || 0
                const fsAvailable = node.dataPartition?.available || 0
                const fsUsed = fsTotal - fsAvailable
                
                let displayAvailable = fsAvailable
                if (node.capacity) {
                    const remainingQuota = Math.max(0, node.capacity - fsUsed)
                    displayAvailable = Math.min(fsAvailable, remainingQuota)
                }

                return (
                <TableRow key={node.id}>
                  <TableCell className="font-mono text-xs">{node.id.substring(0, 16)}...</TableCell>
                  <TableCell>
                    <div>{node.hostname}</div>
                    <div className="text-xs text-muted-foreground">{node.addr}</div>
                  </TableCell>
                  <TableCell>{node.zone || "-"}</TableCell>
                  <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {node.tags.map((tag, i) => (
                            <span key={tag} className="text-xs">
                                {tag}{i < node.tags.length - 1 ? ", " : ""}
                            </span>
                        ))}
                      </div>
                  </TableCell>
                  <TableCell>{node.partitions !== null ? node.partitions : "-"}</TableCell>
                  <TableCell>{node.capacity ? formatBytes(node.capacity) : "-"}</TableCell>
                  <TableCell>{node.dataPartition ? formatBytes(fsUsed) : "-"}</TableCell>
                  <TableCell>{node.dataPartition ? formatBytes(displayAvailable) : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={node.isUp ? "default" : "destructive"}>
                      {node.isUp ? "Up" : "Down"}
                    </Badge>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  )
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
