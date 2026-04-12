                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        'use client'

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorActions } from '../hooks/useEditorActions'
import { VideoPreloadProvider, useVideoPreload } from '../hooks/useVideoPreload'
import { videoCacheManager } from '../hooks/useVideoCache'
import { VideoEditorProject, VideoClip } from '../types/editor.types'
import { calculateTimelineDuration, framesToTime, computeClipPositions } from '../utils/time-utils'
import { Timeline } from './Timeline'
import { TransitionPicker } from './TransitionPicker'

interface RemotionPreviewProps {
    project: VideoEditorProject
    currentFrame: number
    playing: boolean
    onFrameChange?: (frame: number) => void
    onPlayingChange?: (playing: boolean) => void
}

function RemotionPreview({ project, currentFrame, playing, onFrameChange, onPlayingChange }: RemotionPreviewProps) {
    const t = useTranslations('video')
    const containerRef = useRef<HTMLDivElement>(null)
    const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
    const rafRef = useRef<number | null>(null)
    const isPlayingRef = useRef(false)
    const initializedRef = useRef<Set<string>>(new Set())

    const computedClips = useMemo(() => computeClipPositions(project.timeline), [project.timeline])
    const { getThumbnail, markLoaded, getLoadState, preloadVideo } = useVideoPreload()

    const [currentClipIndex, setCurrentClipIndex] = useState(0)
    const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number; loadedVideos: string[] }>({ loaded: 0, total: project.timeline.length, loadedVideos: [] })
    const [isReady, setIsReady] = useState(false)

    const checkAllVideosReady = useCallback(() => {
        return computedClips.every(clip => {
            const video = videoRefs.current.get(clip.src)
            return video && video.readyState >= 3
        })
    }, [computedClips])

    const updateLoadingProgress = useCallback(() => {
        const loadedVideos: string[] = []
        computedClips.forEach(clip => {
            const video = videoRefs.current.get(clip.src)
            if (video && video.readyState >= 3) {
                loadedVideos.push(clip.src)
            }
        })
        setLoadingProgress({
            loaded: loadedVideos.length,
            total: computedClips.length,
            loadedVideos
        })
    }, [computedClips])

    useEffect(() => {
        computedClips.forEach(clip => {
            if (!initializedRef.current.has(clip.src)) {
                const cached = videoCacheManager.get(clip.src)
                if (cached) {
                    if (!videoRefs.current.has(clip.src)) {
                        videoRefs.current.set(clip.src, cached.element)
                    }
                    initializedRef.current.add(clip.src)
                    markLoaded(clip.src, cached.thumbnail)

                    if (cached.element.readyState < 3) {
                        const onReady = () => {
                            setIsReady(checkAllVideosReady())
                            updateLoadingProgress()
                        }
                        cached.element.addEventListener('canplaythrough', onReady, { once: true })
                    }
                } else {
                    preloadVideo(clip.src).then(() => {
                        const cached = videoCacheManager.get(clip.src)
                        if (cached && !videoRefs.current.has(clip.src)) {
                            videoRefs.current.set(clip.src, cached.element)
                        }
                        initializedRef.current.add(clip.src)
                        updateLoadingProgress()
                        setIsReady(checkAllVideosReady())
                    })
                    initializedRef.current.add(clip.src)
                }
            }
        })
    }, [computedClips, markLoaded, preloadVideo, updateLoadingProgress, checkAllVideosReady])

    useEffect(() => {
        const interval = setInterval(() => {
            setIsReady(checkAllVideosReady())
            updateLoadingProgress()
        }, 500)
        return () => clearInterval(interval)
    }, [checkAllVideosReady, updateLoadingProgress])

    useEffect(() => {
        isPlayingRef.current = playing

        if (playing && isReady) {
            const currentClip = computedClips[currentClipIndex]
            const video = videoRefs.current.get(currentClip?.src)

            if (video) {
                video.play().catch(console.error)
            }

            const tick = () => {
                if (!isPlayingRef.current) return

                const currentClip = computedClips[currentClipIndex]
                const video = videoRefs.current.get(currentClip?.src)

                if (video && currentClip) {
                    const currentTime = (currentFrame - currentClip.startFrame) / project.config.fps

                    if (Math.abs(currentTime - video.currentTime) > 0.1) {
                        video.currentTime = currentTime
                    }

                    if (video.ended || video.currentTime >= video.duration - 0.1) {
                        if (currentClipIndex < computedClips.length - 1) {
                            setCurrentClipIndex(prev => prev + 1)
                        } else {
                            onPlayingChange?.(false)
                        }
                    }
                }

                onFrameChange?.(currentFrame + 1)
                rafRef.current = requestAnimationFrame(tick)
            }

            rafRef.current = requestAnimationFrame(tick)
        } else {
            const currentClip = computedClips[currentClipIndex]
            const video = videoRefs.current.get(currentClip?.src)
            if (video) {
                video.pause()
            }
        }

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [playing, isReady, currentClipIndex, computedClips, currentFrame, project.config.fps, onFrameChange, onPlayingChange])

    useEffect(() => {
        if (!playing && isReady) {
            const currentClip = computedClips[currentClipIndex]
            const video = videoRefs.current.get(currentClip?.src)
            if (video) {
                video.currentTime = (currentFrame - currentClip.startFrame) / project.config.fps
            }
        }
    }, [currentFrame, playing, isReady, currentClipIndex, computedClips, project.config.fps])

    useEffect(() => {
        return () => {
            videoRefs.current.clear()
        }
    }, [])

    const loadedCount = Array.from(videoRefs.current.values()).filter(v => v.readyState >= 3).length
    const totalVideoCount = project.timeline.length

    if (project.timeline.length === 0) {
        return (
            <div style={{
                width: '100%',
                aspectRatio: `${project.config.width} / ${project.config.height}`,
                maxHeight: '100%',
                background: 'var(--glass-bg-surface)',
                border: '1px solid var(--glass-stroke-base)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                color: 'var(--glass-text-tertiary)'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                        <AppIcon name="image" className="w-12 h-12" />
                    </div>
                    <span>{t('editor.preview.emptyStartEditing')}</span>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            width: '100%',
            aspectRatio: `${project.config.width} / ${project.config.height}`,
            maxHeight: '100%',
            background: 'var(--glass-overlay-strong)',
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative'
        }}>
            <div ref={containerRef} style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {computedClips.map((clip, index) => {
                    return (
                        <video
                            key={clip.id}
                            ref={el => {
                                if (el && !videoRefs.current.has(clip.src)) {
                                    videoRefs.current.set(clip.src, el)
                                }
                            }}
                            src={clip.src}
                            style={{
                                position: 'absolute',
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                opacity: index === currentClipIndex && isReady ? 1 : 0,
                                transition: 'opacity 0.3s ease'
                            }}
                            preload="auto"
                            muted={false}
                        />
                    )
                })}
            </div>

            {!isReady && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                }}>
                    <LoadingSpinner progress={loadingProgress} />
                </div>
            )}
        </div>
    )
}

const LoadingSpinner: React.FC<{ progress: { loaded: number; total: number; loadedVideos: string[] } }> = ({ progress }) => {
    const { loaded, total, loadedVideos } = progress
    const percentage = total > 0 ? (loaded / total) * 100 : 0

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
        }}>
            <div style={{
                width: '60px',
                height: '60px',
                border: '4px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
            <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: '14px', marginBottom: '8px' }}>视频加载中...</div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>
                    {loaded} / {total} 已加载
                </div>
            </div>
            <div style={{
                width: '200px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '2px',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: '#fff',
                    transition: 'width 0.3s ease'
                }} />
            </div>
            <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px'
            }}>
                {Array.from({ length: total }, (_, i) => {
                    const isLoaded = i < loaded
                    return (
                        <div
                            key={i}
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                background: isLoaded ? 'rgba(76, 175, 80, 0.8)' : 'rgba(255, 255, 255, 0.2)',
                                border: '2px solid',
                                borderColor: isLoaded ? 'rgba(76, 175, 80, 1)' : 'rgba(255, 255, 255, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: isLoaded ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                                fontWeight: 600,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {isLoaded ? '✓' : i + 1}
                        </div>
                    )
                })}
            </div>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

function VideoEditorStageContent({
    projectId,
    episodeId,
    initialProject,
    onBack
}: {
    projectId: string
    episodeId: string
    initialProject?: VideoEditorProject
    onBack?: () => void
}) {
    const t = useTranslations('video')
    const {
        project,
        timelineState,
        isDirty,
        removeClip,
        updateClip,
        reorderClips,
        play,
        pause,
        seek,
        selectClip,
        setZoom,
        markSaved
    } = useEditorState({ episodeId, initialProject })

    const { saveProject, startRender } = useEditorActions({ projectId, episodeId })
    const { getThumbnail, isAllLoaded, loadedCount, totalCount } = useVideoPreload()

    const videoSrcs = useMemo(() => project.timeline.map(c => c.src), [project.timeline])
    const allVideosLoaded = isAllLoaded(videoSrcs)

    const totalDuration = calculateTimelineDuration(project.timeline)
    const totalTime = framesToTime(totalDuration, project.config.fps)
    const currentTime = framesToTime(timelineState.currentFrame, project.config.fps)

    const handlePlayPause = () => {
        if (timelineState.playing) {
            pause()
        } else {
            play()
        }
    }

    const handleSave = async () => {
        try {
            await saveProject(project)
            markSaved()
            alert(t('editor.alert.saveSuccess'))
        } catch (error) {
            _ulogError('Save failed:', error)
            alert(t('editor.alert.saveFailed'))
        }
    }

    const handleExport = async () => {
        try {
            await startRender(project.id)
            alert(t('editor.alert.exportStarted'))
        } catch (error) {
            _ulogError('Export failed:', error)
            alert(t('editor.alert.exportFailed'))
        }
    }

    const selectedClip = project.timeline.find(c => c.id === timelineState.selectedClipId)
    const getClipThumbnail = (clip: VideoClip) => getThumbnail(clip.src)

    return (
        <div className="video-editor-stage" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--glass-bg-canvas)',
            color: 'var(--glass-text-primary)'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--glass-stroke-base)',
                background: 'var(--glass-bg-surface)'
            }}>
                <button onClick={onBack} className="glass-btn-base glass-btn-secondary px-4 py-2">
                    {t('editor.toolbar.back')}
                </button>

                <div style={{ flex: 1 }} />

                {!allVideosLoaded && (
                    <span style={{
                        fontSize: '12px',
                        color: 'var(--glass-text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span>加载中 {loadedCount}/{totalCount}</span>
                    </span>
                )}

                {allVideosLoaded && (
                    <span style={{ fontSize: '12px', color: 'var(--glass-text-secondary)' }}>
                        已就绪
                    </span>
                )}

                <button
                    onClick={handleSave}
                    className="glass-btn-base glass-btn-secondary px-4 py-2"
                    disabled={!isDirty}
                >
                    {isDirty ? t('editor.toolbar.saveDirty') : t('editor.toolbar.saved')}
                </button>

                <button
                    onClick={handleExport}
                    className="glass-btn-base glass-btn-tone-primary px-4 py-2"
                >
                    {t('editor.toolbar.export')}
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    gap: '16px',
                    overflow: 'hidden'
                }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RemotionPreview
                            project={project}
                            currentFrame={timelineState.currentFrame}
                            playing={timelineState.playing}
                            onFrameChange={seek}
                            onPlayingChange={(playing) => {
                                if (playing) play()
                                else pause()
                            }}
                        />
                    </div>

                    <div style={{
                        height: '60px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '0 16px',
                        background: 'var(--glass-bg-surface)',
                        borderRadius: '8px'
                    }}>
                        <button
                            onClick={handlePlayPause}
                            style={{
                                background: 'var(--glass-accent-from)',
                                border: 'none',
                                color: 'var(--glass-text-on-accent)',
                                cursor: 'pointer',
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s'
                            }}
                        >
                            <AppIcon name={timelineState.playing ? 'pause' : 'play'} className="w-5 h-5" />
                        </button>

                        <span style={{ fontSize: '13px', color: 'var(--glass-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {currentTime} / {totalTime}
                        </span>

                        <div style={{
                            flex: 1,
                            height: '4px',
                            background: 'var(--glass-stroke-base)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${totalDuration > 0 ? (timelineState.currentFrame / totalDuration) * 100 : 0}%`,
                                height: '100%',
                                background: 'var(--glass-accent-from)',
                                transition: timelineState.playing ? 'none' : 'width 0.1s'
                            }} />
                        </div>
                    </div>
                </div>

                <div style={{
                    width: '280px',
                    borderLeft: '1px solid var(--glass-stroke-base)',
                    padding: '12px',
                    background: 'var(--glass-bg-surface-strong)',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--glass-text-secondary)' }}>
                        {t('editor.right.title')}
                    </h3>
                    {selectedClip ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {getClipThumbnail(selectedClip) && (
                                <div style={{
                                    width: '100%',
                                    aspectRatio: `${project.config.width} / ${project.config.height}`,
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    background: '#000',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <img
                                        src={getClipThumbnail(selectedClip)}
                                        alt="Video thumbnail"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'contain'
                                        }}
                                    />
                                </div>
                            )}
                            <div style={{ fontSize: '12px' }}>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.clipLabel')}</span> {selectedClip.metadata?.description || t('editor.right.clipFallback', { index: project.timeline.findIndex(c => c.id === selectedClip.id) + 1 })}
                                </p>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.durationLabel')}</span> {framesToTime(selectedClip.durationInFrames, project.config.fps)}
                                </p>
                            </div>

                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.transitionLabel')}
                                </h4>
                                <TransitionPicker
                                    value={(selectedClip.transition?.type as string) || 'none'}
                                    duration={selectedClip.transition?.durationInFrames || 15}
                                    onChange={(type, duration) => {
                                        updateClip(selectedClip.id, {
                                            transition: type === 'none' ? undefined : { type, durationInFrames: duration }
                                        })
                                    }}
                                />
                            </div>

                            <button
                                onClick={() => {
                                    if (confirm(t('editor.right.deleteConfirm'))) {
                                        removeClip(selectedClip.id)
                                        selectClip(null)
                                    }
                                }}
                                className="glass-btn-base glass-btn-tone-danger mt-2 px-3 py-2 text-xs"
                            >
                                {t('editor.right.deleteClip')}
                            </button>
                        </div>
                    ) : (
                        <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                            {t('editor.right.selectClipHint')}
                        </p>
                    )}
                </div>
            </div>

            <div style={{
                height: '220px',
                borderTop: '1px solid var(--glass-stroke-base)',
                background: 'var(--glass-bg-surface)'
            }}>
                <Timeline
                    clips={project.timeline}
                    timelineState={timelineState}
                    config={project.config}
                    onReorder={reorderClips}
                    onSelectClip={selectClip}
                    onZoomChange={setZoom}
                    onSeek={seek}
                    getClipLoadState={() => 'loaded'}
                    getClipThumbnail={getClipThumbnail}
                />
            </div>
        </div>
    )
}

interface VideoEditorStageProps {
    projectId: string
    episodeId: string
    initialProject?: VideoEditorProject
    onBack?: () => void
}

export function VideoEditorStage({
    projectId,
    episodeId,
    initialProject,
    onBack
}: VideoEditorStageProps) {
    return (
        <VideoPreloadProvider>
            <VideoEditorStageContent
                projectId={projectId}
                episodeId={episodeId}
                initialProject={initialProject}
                onBack={onBack}
            />
        </VideoPreloadProvider>
    )
}

export default VideoEditorStage