import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { garageFetch, garageFetchText } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

function useGarageToken() {
  const { adminToken } = useAuth();
  return adminToken;
}

// --- Cluster Status & Health ---

export interface NodeInfo {
  id: string;
  hostname: string;
  addr: string;
  isUp: boolean;
  zone: string;
  tags: string[];
  capacity: number | null;
  partitions: number | null;
  dataPartition: {
    available: number;
    total: number;
  } | null;
  garageVersion?: string;
  dbEngine?: string;
}

export interface ClusterStatus {
  nodes: NodeInfo[];
  layoutVersion: number;
  redundancy: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unavailable";
  knownNodes: number;
  connectedNodes: number;
  storageUsed: number;
  partitions: number;
  items: number;
  bucketCount: number;
}

export function useClusterStatus(refetchInterval: number = 0) {
  const token = useGarageToken();
  return useQuery({
    queryKey: ["status"],
    queryFn: async () => {
        try {
            const [statusRes, layoutRes, nodeInfoRes] = await Promise.all([
                garageFetch<any>("/v2/GetClusterStatus"),
                garageFetch<any>("/v2/GetClusterLayout").catch(e => {
                    console.warn("Failed to fetch layout:", e);
                    return null;
                }),
                garageFetch<any>("/v2/GetNodeInfo?node=*").catch(e => {
                    console.warn("Failed to fetch node info:", e);
                    return null;
                })
            ]);

            // Calculate redundancy factor
            // We prefer calculating it from the total number of stored partitions,
            // as this reflects the actual replication factor (copies of data).
            // Garage standard partition count is 256.
            let redundancy = 3; 
            
            if (layoutRes && layoutRes.roles) {
                const totalPartitions = layoutRes.roles.reduce((acc: number, r: any) => acc + (r.storedPartitions || 0), 0);
                if (totalPartitions > 0) {
                    redundancy = Math.round(totalPartitions / 256);
                }
            } else if (layoutRes?.parameters?.zoneRedundancy) {
                const zr = layoutRes.parameters.zoneRedundancy;
                if (typeof zr === 'number') {
                    redundancy = zr;
                } else if (typeof zr === 'object' && 'atLeast' in zr) {
                    redundancy = zr.atLeast;
                } else if (zr === 'maximum') {
                    // If maximum, it equals the number of zones
                    const zones = new Set(layoutRes.roles.map((r: any) => r.zone).filter(Boolean));
                    redundancy = zones.size || 1;
                }
            }
            
            // Map API response to our interface
            const nodes: NodeInfo[] = statusRes.nodes.map((n: any) => {
                // Find partition count from layout roles
                let partitions = null;
                if (layoutRes && layoutRes.roles) {
                    const role = layoutRes.roles.find((r: any) => r.id === n.id);
                    if (role) {
                        partitions = role.storedPartitions;
                    }
                }

                // Find detailed node info (version, db engine)
                let detailedInfo = null;
                if (nodeInfoRes && nodeInfoRes.success && nodeInfoRes.success[n.id]) {
                    detailedInfo = nodeInfoRes.success[n.id];
                }

                return {
                    id: n.id,
                    hostname: n.hostname,
                    addr: n.addr,
                    isUp: n.isUp,
                    zone: n.role?.zone || "",
                    tags: n.role?.tags || [],
                    capacity: n.role?.capacity || null,
                    partitions,
                    dataPartition: n.dataPartition || null,
                    garageVersion: n.garageVersion || detailedInfo?.garageVersion,
                    dbEngine: detailedInfo?.dbEngine
                };
            });
            
            return {
                layoutVersion: statusRes.layoutVersion,
                nodes,
                redundancy
            };
        } catch (e) {
            console.error("ClusterStatus error:", e);
            throw e;
        }
    },
    refetchInterval,
    enabled: !!token,
    retry: false,
  });
}

export function useClusterHealth(refetchInterval: number = 0) {
  const token = useGarageToken();
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      let connectedNodes = 0;
      let knownNodes = 0;
      let storageUsed = 0;
      let items = 0;
      let partitions = 0;
      let bucketCount = 0;
      let status: "healthy" | "degraded" | "unavailable" = "unavailable";

      // Use standard API v2 calls instead of metrics for Dashboard
      try {
          // 1. Get Cluster Status for nodes
          const statusRes = await garageFetch<any>("/v2/GetClusterStatus");
          knownNodes = statusRes.nodes.length;
          connectedNodes = statusRes.nodes.filter((n: any) => n.isUp).length;
          
          status = connectedNodes === knownNodes && knownNodes > 0 ? "healthy" : 
                   connectedNodes > 0 ? "degraded" : "unavailable";

          // 2. Get Layout for partitions
          try {
             const layout = await garageFetch<ClusterLayout>("/v2/GetClusterLayout");
             if (layout && layout.roles) {
                 partitions = layout.roles.reduce((acc, role) => acc + (role.storedPartitions || 0), 0);
             }
          } catch (layoutErr) {
             console.warn("Failed to fetch layout for partition count:", layoutErr);
          }

          // 3. Get Buckets for storage/items
          // Note: This iterates all buckets, which might be slower than metrics for large clusters,
          // but avoids the need for metrics token/endpoint on the main dashboard.
          try {
            const buckets = await garageFetch<any[]>("/v2/ListBuckets");
            bucketCount = buckets.length;
            
            // Fetch bucket info in chunks to avoid overwhelming the browser/network
            const chunks = [];
            const chunkSize = 5;
            for (let i = 0; i < buckets.length; i += chunkSize) {
                chunks.push(buckets.slice(i, i + chunkSize));
            }
            
            for (const chunk of chunks) {
                await Promise.all(chunk.map(async (b: any) => {
                    try {
                        const info = await garageFetch<any>(`/v2/GetBucketInfo?id=${b.id}`);
                        storageUsed += (info.bytes || 0);
                        items += (info.objects || 0);
                    } catch (err) {
                        console.warn(`Failed to fetch info for bucket ${b.id}`, err);
                    }
                }));
            }
          } catch (bucketErr) {
            console.error("Failed to fetch buckets for stats:", bucketErr);
          }

      } catch (e) {
        console.error("Failed to fetch cluster health via API:", e);
        status = "unavailable";
      }

      return {
        status,
        knownNodes,
        connectedNodes,
        storageUsed,
        partitions,
        items,
        bucketCount
      };
    },
    refetchInterval,
    enabled: !!token,
    retry: false,
  });
}

// --- Buckets ---

export interface Bucket {
  id: string;
  globalAliases: string[];
  localAliases: any[];
  objects?: number;
  bytes?: number;
  quotas?: {
    maxSize: number | null;
    maxObjects: number | null;
  };
}

export interface BucketInfo extends Bucket {
  websiteAccess: boolean;
  quotas: {
    maxSize: number | null;
    maxObjects: number | null;
  };
  keys: {
    accessKeyId: string;
    name: string;
    permissions: {
      read: boolean;
      write: boolean;
      owner: boolean;
    };
  }[];
}

export function useBuckets() {
  const { mode, adminToken, s3Credentials } = useAuth();
  return useQuery({
    queryKey: ["buckets", mode],
    queryFn: async () => {
      if (mode === "S3" && s3Credentials) {
         const res = await fetch("/api/s3", {
            method: "POST",
            body: JSON.stringify({
                action: "listBuckets",
                config: s3Credentials
            })
         });
         if (!res.ok) {
             const err = await res.json().catch(() => ({}));
             throw new Error(err.error || res.statusText);
         }
         return res.json();
      }

      const buckets = await garageFetch<Bucket[]>("/v2/ListBuckets");
      // Fetch details for each bucket to get stats (objects and bytes)
      // We limit concurrency to avoid overwhelming the browser/server if there are many buckets
      const detailedBuckets = [];
      const chunkSize = 5;
      for (let i = 0; i < buckets.length; i += chunkSize) {
          const chunk = buckets.slice(i, i + chunkSize);
          const results = await Promise.all(chunk.map(async (b) => {
              try {
                  const info = await garageFetch<BucketInfo>(`/v2/GetBucketInfo?id=${b.id}`);
                  return { ...b, objects: info.objects, bytes: info.bytes, quotas: info.quotas };
              } catch (e) {
                  console.warn(`Failed to fetch info for bucket ${b.id}`, e);
                  return b;
              }
          }));
          detailedBuckets.push(...results);
      }
      return detailedBuckets;
    },
    enabled: !!(mode === "ADMIN" ? adminToken : s3Credentials),
    retry: false,
  });
}

export function useBucketInfo(idOrAlias: string) {
  const token = useGarageToken();
  const isId = /^[0-9a-f]{64}$/i.test(idOrAlias);
  const param = isId ? `id=${idOrAlias}` : `globalAlias=${idOrAlias}`;
  return useQuery({
    queryKey: ["bucket", idOrAlias],
    queryFn: () => garageFetch<BucketInfo>(`/v2/GetBucketInfo?${param}`),
    enabled: !!idOrAlias && !!token,
    retry: false,
  });
}

export function useCreateBucket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { alias: string }) => 
      garageFetch<Bucket>("/v2/CreateBucket", {
        method: "POST",
        body: JSON.stringify({ globalAlias: data.alias }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => 
      garageFetch(`/v2/DeleteBucket?id=${id}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
    },
  });
}

export function useUpdateBucket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, websiteAccess?: { enabled: boolean, indexDocument?: string, errorDocument?: string }, quotas?: { maxSize?: number | null, maxObjects?: number | null } }) => 
      garageFetch(`/v2/UpdateBucket?id=${data.id}`, {
        method: "POST",
        body: JSON.stringify({
          websiteAccess: data.websiteAccess,
          quotas: data.quotas
        }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bucket", variables.id] });
    },
  });
}

export function useAddBucketAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, alias: string }) => 
      garageFetch(`/v2/AddBucketAlias`, {
        method: "POST",
        body: JSON.stringify({
          bucketId: data.id,
          globalAlias: data.alias
        })
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bucket", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
    },
  });
}

export function useRemoveBucketAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, alias: string }) => 
      garageFetch(`/v2/RemoveBucketAlias`, {
        method: "POST",
        body: JSON.stringify({
          bucketId: data.id,
          globalAlias: data.alias
        })
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bucket", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
    },
  });
}

export function useAllowBucketKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bucketId: string, accessKeyId: string, permissions: { read?: boolean, write?: boolean, owner?: boolean } }) => 
      garageFetch(`/v2/AllowBucketKey`, {
        method: "POST",
        body: JSON.stringify({
          bucketId: data.bucketId,
          accessKeyId: data.accessKeyId,
          permissions: data.permissions
        }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bucket"] });
      queryClient.invalidateQueries({ queryKey: ["key", variables.accessKeyId] });
    },
  });
}

export function useDenyBucketKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bucketId: string, accessKeyId: string, permissions: { read?: boolean, write?: boolean, owner?: boolean } }) => 
      garageFetch(`/v2/DenyBucketKey`, {
        method: "POST",
        body: JSON.stringify({
          bucketId: data.bucketId,
          accessKeyId: data.accessKeyId,
          permissions: data.permissions
        }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bucket"] });
      queryClient.invalidateQueries({ queryKey: ["key", variables.accessKeyId] });
    },
  });
}

// --- Keys ---

export interface KeyInfo {
  id: string;
  name: string;
}

export interface KeyDetails extends KeyInfo {
  accessKeyId: string;
  secretAccessKey?: string;
  permissions: {
    createBucket: boolean;
  };
  buckets: {
    id: string;
    globalAliases: string[];
    permissions: {
      read: boolean;
      write: boolean;
      owner: boolean;
    };
  }[];
}

export function useKeys() {
  const token = useGarageToken();
  return useQuery({
    queryKey: ["keys"],
    queryFn: () => garageFetch<KeyInfo[]>("/v2/ListKeys"),
    enabled: !!token,
    retry: false,
  });
}

export function useKeyInfo(id: string, showSecretKey: boolean = false) {
  const token = useGarageToken();
  return useQuery({
    queryKey: ["key", id, showSecretKey],
    queryFn: () => garageFetch<KeyDetails>(`/v2/GetKeyInfo?id=${id}${showSecretKey ? '&showSecretKey=true' : ''}`),
    enabled: !!id && !!token,
    retry: false,
  });
}

export function useCreateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => 
      garageFetch<{ accessKeyId: string, secretAccessKey: string }>("/v2/CreateKey", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useDeleteKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => 
      garageFetch(`/v2/DeleteKey?id=${id}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useUpdateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { accessKeyId: string, name?: string, allow?: { createBucket?: boolean }, deny?: { createBucket?: boolean } }) => 
      garageFetch(`/v2/UpdateKey?id=${data.accessKeyId}`, {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          allow: data.allow,
          deny: data.deny
        }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["key", variables.accessKeyId] });
      queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

// --- Layout ---

export interface ClusterLayout {
  version: number;
  parameters?: {
    zoneRedundancy?: { atLeast: number } | "maximum" | number;
    [key: string]: any;
  };
  roles: {
    id: string;
    zone: string;
    capacity: number | null;
    tags: string[];
    storedPartitions?: number;
  }[];
  stagedRoleChanges: {
    id: string;
    zone: string;
    capacity: number | null;
    tags: string[];
    remove: boolean;
  }[];
}

export function useClusterLayout() {
  return useQuery({
    queryKey: ["layout"],
    queryFn: () => garageFetch<ClusterLayout>("/v2/GetClusterLayout"),
  });
}

export function useApplyClusterLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => 
      garageFetch(`/v2/ApplyClusterLayout`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["layout"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function useRevertClusterLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => 
      garageFetch(`/v2/RevertClusterLayout`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["layout"] });
    },
  });
}

export function useUpdateNodeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, zone?: string, capacity?: number | null, tags?: string[], remove?: boolean }) => {
      return garageFetch(`/v2/UpdateClusterLayout`, {
        method: "POST",
        body: JSON.stringify({
          roles: [data]
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["layout"] });
    },
  });
}

// --- Nodes ---

export function useConnectNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addr: string) => 
      garageFetch(`/v2/ConnectClusterNodes`, {
        method: "POST",
        body: JSON.stringify([addr]),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

// --- S3 Proxy ---

export function useConfigureCors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bucket, config, origins }: { bucket: string, config: any, origins?: string[] }) => {
      const res = await fetch("/api/s3", {
        method: "POST",
        body: JSON.stringify({
          action: "configure-cors",
          config,
          params: { bucket, origins }
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to configure CORS");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cors", variables.bucket] });
    },
  });
}

export function useGetCors(bucket: string, config: any) {
  return useQuery({
    queryKey: ["cors", bucket],
    queryFn: async () => {
        if (!config) return null;
        const res = await fetch("/api/s3", {
            method: "POST",
            body: JSON.stringify({
                action: "get-cors",
                config,
                params: { bucket }
            }),
        });
        if (!res.ok) {
             const err = await res.json();
             throw new Error(err.error || "Failed to get CORS");
        }
        return res.json();
    },
    enabled: !!config && !!bucket
  });
}
