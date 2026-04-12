import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useRef, useState, type MouseEvent, useEffect } from 'react'
import { videoCacheManager } from '@/features/video-editor/hooks/useVideoCache'

interface UsePanelPlayerParams {
  videoRatio: string
  imageUrl?: string
  videoUrl?: string
  lipSyncVideoUrl?: string
  showLipSyncVideo: boolean
  onPreviewImage?: (imageUrl: string) => void
}

export function usePanelPlayer({
  videoRatio,
  imageUrl,
  videoUrl,
  lipSyncVideoUrl,
  showLipSyncVideo,
  onPreviewImage,
}: UsePanelPlayerParams) {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cssAspectRatio = videoRatio.replace(':', '/')
  const currentVideoUrl = videoUrl
    ? (showLipSyncVideo && lipSyncVideoUrl ? lipSyncVideoUrl : videoUrl)
    : undefined

  useEffect(() => {
    if (currentVideoUrl) {
      const cached = videoCacheManager.get(currentVideoUrl)
      if (cached && videoRef.current && videoRef.current.src !== cached.element.src) {
        videoRef.current.src = cached.element.src
        videoRef.current.load()
      } else if (!cached && videoCacheManager.getLoadingState(currentVideoUrl) === 'idle') {
        videoCacheManager.loadVideo(currentVideoUrl).catch(() => {})
      }
    }
  }, [currentVideoUrl])

  const handlePreviewImage = useCallback((event?: MouseEvent) => {
    if (event) event.stopPropagation()
    if (!imageUrl || !onPreviewImage) return
    onPreviewImage(imageUrl)
  }, [imageUrl, onPreviewImage])

  const handlePlayClick = useCallback(async () => {
    setIsPlaying(true)
    setTimeout(async () => {
      if (!videoRef.current) return

      if (currentVideoUrl) {
        const cached = videoCacheManager.get(currentVideoUrl)
        if (cached) {
          if (videoRef.current.src !== cached.element.src) {
            videoRef.current.src = cached.element.src
          }
        }
      }

      try {
        await videoRef.current.play()
      } catch (error: unknown) {
        if ((error as { name?: string }).name !== 'AbortError') {
          _ulogError('Video play error:', error)
        }
      }
    }, 100)
  }, [currentVideoUrl])

  return {
    cssAspectRatio,
    currentVideoUrl,
    isPlaying,
    setIsPlaying,
    videoRef,
    handlePreviewImage,
    handlePlayClick,
  }
}
