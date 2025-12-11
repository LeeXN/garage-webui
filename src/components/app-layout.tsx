"use client"

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { usePathname } from "next/navigation"
import React from "react"
import { ModeToggle } from "@/components/mode-toggle"
import { TokenDialog } from "@/components/token-dialog"
import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"

export function AppLayout({ 
  children,
  defaultRegion,
  defaultEndpoint
}: { 
  children: React.ReactNode
  defaultRegion?: string
  defaultEndpoint?: string
}) {
  const pathname = usePathname()
  const pathSegments = pathname.split('/').filter(Boolean)
  const isSharePage = pathname.startsWith("/share")

  const [adminTokenStatus, setAdminTokenStatus] = useState<"ok" | "invalid" | "error" | "not-configured">("ok")

  useEffect(() => {
      fetch("/api/health/admin-token")
        .then(res => res.json())
        .then(data => setAdminTokenStatus(data.status))
        .catch(() => setAdminTokenStatus("error"))
  }, [])

  return (
    <SidebarProvider>
      <AppSidebar />
      <TokenDialog defaultRegion={defaultRegion} defaultEndpoint={defaultEndpoint} />
      <main className="flex-1 flex flex-col min-h-screen bg-background text-foreground">
        {adminTokenStatus === "invalid" && (
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Warning: The configured GARAGE_ADMIN_TOKEN is invalid. Some S3 features (Quota/Size) will be disabled. Please check your server configuration.
            </div>
        )}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {isSharePage ? (
                    <BreadcrumbItem>
                        <BreadcrumbPage>Garage Share</BreadcrumbPage>
                    </BreadcrumbItem>
                ) : (
                    <>
                        <BreadcrumbItem>
                        <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        {pathSegments.map((segment, index) => {
                        const href = `/${pathSegments.slice(0, index + 1).join('/')}`
                        const isLast = index === pathSegments.length - 1
                        return (
                            <React.Fragment key={href}>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                {isLast ? (
                                <BreadcrumbPage className="capitalize">{segment}</BreadcrumbPage>
                                ) : (
                                <BreadcrumbLink href={href} className="capitalize">{segment}</BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            </React.Fragment>
                        )
                        })}
                    </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <ModeToggle />
        </header>
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
