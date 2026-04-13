'use client'

import React, { createContext, useContext, useCallback, useRef, useState } from 'react'
import { videoCacheManager } from './useVideoCache'

interface LoadedEntry {
  thumbnail: string | null
}

interface VideoPreloadContextValue {
  getThumbnail: (src: string) => string | null
  markLoaded: (src: string, thumbnail: string | null) => void
  getLoadState: (src: string) => boolean
  preloadVideo: (src: string) => Promise<void>
  isAllLoaded: (srcs: string[]) => boolean
  loadedCount: number
  totalCount: number
}

const VideoPreloadContext = createContext<VideoPreloadContextValue | null>(null)

function captureThumbnail(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    return null
  }
}

export function VideoPreloadProvider({ children }: { children: React.ReactNode }) {
  const loadedRef = useRef<Map<string, LoadedEntry>>(new Map())
  const [, forceUpdate] = useState(0)

  const getThumbnail = useCallback((src: string): string | null => {
    return loadedRef.current.get(src)?.thumbnail ?? null
  }, [])

  const markLoaded = useCallback((src: string, thumbnail: string | null) => {
    loadedRef.current.set(src, { thumbnail })
    forceUpdate(c => c + 1)
  }, [])

  const getLoadState = useCallback((src: string): boolean => {
    return loadedRef.current.has(src)
  }, [])

  const preloadVideo = useCallback((src: string): Promise<void> => {
    if (videoCacheManager.has(src)) {
      const cached = videoCacheManager.get(src)
      if (cached && !loadedRef.current.has(src)) {
        markLoaded(src, cached.thumbnail)
      }
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = 'anonymous'
      video.src = src

      const onReady = () => {
        const thumbnail = captureThumbnail(video)
        videoCacheManager.set(src, { element: video, thumbnail })
        markLoaded(src, thumbnail)
        cleanup()
        resolve()
      }

      const onError = () => {
        videoCacheManager.set(src, { element: video, thumbnail: null })
        markLoaded(src, null)
        cleanup()
        resolve()
      }

      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('canplaythrough', onReady)
        video.removeEventListener('error', onError)
      }

      video.addEventListener('loadeddata', onReady, { once: true })
      video.addEventListener('canplaythrough', onReady, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.load()
    })
  }, [markLoaded])

  const isAllLoaded = useCallback((srcs: string[]): boolean => {
    return srcs.length > 0 && srcs.every(src => loadedRef.current.has(src))
  }, [])

  const value: VideoPreloadContextValue = {
    getThumbnail,
    markLoaded,
    getLoadState,
    preloadVideo,
    isAllLoaded,
    loadedCount: loadedRef.current.size,
    totalCount: loadedRef.current.size,
  }

  return React.createElement(VideoPreloadContext.Provider, { value }, children)
}

export function useVideoPreload(): VideoPreloadContextValue {
  const ctx = useContext(VideoPreloadContext)
  if (!ctx) {
    throw new Error('useVideoPreload must be used within VideoPreloadProvider')
  }
  return ctx
}
