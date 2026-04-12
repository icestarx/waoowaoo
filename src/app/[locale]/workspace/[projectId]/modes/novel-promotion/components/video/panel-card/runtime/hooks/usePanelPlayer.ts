import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useRef, useState, type MouseEvent } from 'react'

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

  const handlePreviewImage = useCallback((event?: MouseEvent) => {
    if (event) event.stopPropagation()
    if (!imageUrl || !onPreviewImage) return
    onPreviewImage(imageUrl)
  }, [imageUrl, onPreviewImage])

  const handlePlayClick = useCallback(async () => {
    console.log('[usePanelPlayer] handlePlayClick called')
    setIsPlaying(true)
    console.log('[usePanelPlayer] setIsPlaying(true) called')
    setTimeout(async () => {
      if (!videoRef.current) {
        console.log('[usePanelPlayer] videoRef.current is null')
        return
      }
      try {
        console.log('[usePanelPlayer] attempting to play video')
        await videoRef.current.play()
        console.log('[usePanelPlayer] video.play() succeeded')
      } catch (error: unknown) {
        console.error('[usePanelPlayer] video.play() error:', error)
        if ((error as { name?: string }).name !== 'AbortError') {
          _ulogError('Video play error:', error)
        }
      }
    }, 100)
  }, [])

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
