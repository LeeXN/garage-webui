"use client"

import { Home, Database, Key, Server, Activity, LogOut } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"

const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    adminOnly: true,
  },
  {
    title: "Buckets",
    url: "/buckets",
    icon: Database,
    adminOnly: false,
  },
  {
    title: "Keys",
    url: "/keys",
    icon: Key,
    adminOnly: true,
  },
  {
    title: "Cluster",
    url: "/cluster",
    icon: Activity,
    adminOnly: true,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { logout, mode } = useAuth()

  // Hide sidebar content for shared pages
  if (pathname?.startsWith("/share")) {
      return (
        <Sidebar>
            <SidebarHeader className="p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2 font-bold text-xl">
                <Server className="h-6 w-6" />
                <span>Garage Share</span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                {/* Empty content for share view */}
            </SidebarContent>
        </Sidebar>
      )
  }

  const handleLogout = () => {
    logout()
    toast.success("Logged out")
  }

  const filteredItems = items.filter(item => {
    if (mode === "ADMIN") {
      return true
    }
    // For S3 mode or unauthenticated/loading state, hide admin items
    return !item.adminOnly
  })

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Server className="h-6 w-6" />
          <span>{mode === "S3" ? "Garage S3" : "Garage Admin"}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
