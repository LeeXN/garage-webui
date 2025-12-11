"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AuthMode = "ADMIN" | "S3" | null

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
  region?: string
  endpoint?: string
}

interface AuthContextType {
  mode: AuthMode
  adminToken: string | null
  s3Credentials: S3Credentials | null
  loginAdmin: (token: string) => void
  loginS3: (creds: S3Credentials) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode>(null)
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const [s3Credentials, setS3Credentials] = useState<S3Credentials | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Hydrate from sessionStorage
    const storedMode = sessionStorage.getItem("garage_auth_mode") as AuthMode
    const storedToken = sessionStorage.getItem("garage_token")
    const storedS3 = sessionStorage.getItem("garage_s3_creds")

    // Migration/Fallback: Check localStorage for legacy admin token
    const legacyToken = localStorage.getItem("garage_token")
    
    if (storedMode === "ADMIN" && storedToken) {
      setMode("ADMIN")
      setAdminToken(storedToken)
      setIsAuthenticated(true)
    } else if (storedMode === "S3" && storedS3) {
      try {
        setMode("S3")
        setS3Credentials(JSON.parse(storedS3))
        setIsAuthenticated(true)
      } catch (e) {
        console.error("Failed to parse S3 credentials", e)
        sessionStorage.removeItem("garage_s3_creds")
      }
    } else if (legacyToken) {
      // Auto-migrate legacy token to sessionStorage
      setMode("ADMIN")
      setAdminToken(legacyToken)
      setIsAuthenticated(true)
      sessionStorage.setItem("garage_auth_mode", "ADMIN")
      sessionStorage.setItem("garage_token", legacyToken)
      localStorage.removeItem("garage_token") // Clean up
    }
  }, [])

  const loginAdmin = (token: string) => {
    setMode("ADMIN")
    setAdminToken(token)
    setS3Credentials(null)
    setIsAuthenticated(true)
    sessionStorage.setItem("garage_auth_mode", "ADMIN")
    sessionStorage.setItem("garage_token", token)
    sessionStorage.removeItem("garage_s3_creds")
    // Clear legacy
    localStorage.removeItem("garage_token")
    window.location.reload()
  }

  const loginS3 = (creds: S3Credentials) => {
    setMode("S3")
    setS3Credentials(creds)
    setAdminToken(null)
    setIsAuthenticated(true)
    sessionStorage.setItem("garage_auth_mode", "S3")
    sessionStorage.setItem("garage_s3_creds", JSON.stringify(creds))
    sessionStorage.removeItem("garage_token")
    // Clear legacy
    localStorage.removeItem("garage_token")
    window.location.reload()
  }

  const logout = () => {
    setMode(null)
    setAdminToken(null)
    setS3Credentials(null)
    setIsAuthenticated(false)
    sessionStorage.clear()
    localStorage.removeItem("garage_token")
    window.location.href = "/"
  }

  return (
    <AuthContext.Provider
      value={{
        mode,
        adminToken,
        s3Credentials,
        loginAdmin,
        loginS3,
        logout,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
