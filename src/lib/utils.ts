import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function formatCapacity(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "-"
  
  const GB = 1024 * 1024 * 1024
  const TB = 1024 * GB
  
  if (bytes >= TB) {
    return `${(bytes / TB).toFixed(2)} TB`
  } else if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    // Ignore and try fallback
  }

  try {
    const textArea = document.createElement("textarea")
    textArea.value = text
    
    // Ensure it's not visible but part of layout
    textArea.style.position = "fixed"
    textArea.style.left = "0"
    textArea.style.top = "0"
    textArea.style.opacity = "0"
    textArea.style.pointerEvents = "none"
    
    // Try to append to the parent of the active element to stay within focus trap
    // This is crucial for Dialogs
    const activeElement = document.activeElement
    if (activeElement && activeElement.parentElement) {
      activeElement.parentElement.appendChild(textArea)
    } else {
      document.body.appendChild(textArea)
    }
    
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, 99999) // For mobile
    
    const successful = document.execCommand('copy')
    
    if (textArea.parentNode) {
      textArea.parentNode.removeChild(textArea)
    }
    
    return successful
  } catch (err) {
    return false
  }
}
