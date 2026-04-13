'use client'

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorActions } from '../hooks/useEditorActions'
import { VideoPreloadProvider, useVideoPreload } from '../hooks/useVideoPreload'
import { videoCacheManager } from '../hooks/useVideoCache'
import type { VideoEditorProject, VideoClip, ClipTransition } from '../types/editor.types'
import { calculateTimelineDuration, framesToTime, computeClipPositions } from '../utils/time-utils'
import { TransitionPicker, type TransitionType } from './TransitionPicker'

// ============================================================
// EditorToolbar
// ============================================================

function EditorToolbar({
  clipCount,
  isDirty,
  isSaving,
  onSave,
  onBack,
}: {
  clipCount: number
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onBack: () => void
}) {
  const t = useTranslations('video')
  return (
    <div className="flex items-center gap-3 px-4 py-3 glass-surface border-b border-[var(--glass-stroke-base)]">
      <button
        onClick={onBack}
        className="glass-btn-base glass-btn-secondary px-3 py-2 text-sm"
      >
        {t('editor.toolbar.back')}
      </button>

      <div className="flex-1" />

      <span className="text-xs text-[var(--glass-text-tertiary)]">
        {clipCount} {t('editor.timeline.videoTrack')}
      </span>

      <button
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className={`glass-btn-base px-4 py-2 text-sm font-medium flex items-center gap-1.5 ${
          isDirty ? 'glass-btn-primary' : 'glass-btn-secondary'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isSaving ? (
          <AppIcon name="loader" className="w-4 h-4 animate-spin" />
        ) : (
          <AppIcon name="check" className="w-4 h-4" />
        )}
        {isDirty ? t('editor.toolbar.saveDirty') : t('editor.toolbar.saved')}
      </button>
    </div>
  )
}

// ============================================================
// EditorPreview
// ============================================================

function EditorPreview({
  project,
  currentFrame,
  playing,
  onFrameChange,
  onPlayPause,
  onSeek,
}: {
  project: VideoEditorProject
  currentFrame: number
  playing: boolean
  onFrameChange: (frame: number) => void
  onPlayPause: () => void
  onSeek: (frame: number) => void
}) {
  const t = useTranslations('video')
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const rafRef = useRef<number | null>(null)
  const frameRef = useRef(currentFrame)
  const computedClips = useMemo(() => computeClipPositions(project.timeline), [project.timeline])
  const { preloadVideo } = useVideoPreload()

  const totalDuration = calculateTimelineDuration(project.timeline)
  const totalTime = framesToTime(totalDuration, project.config.fps)

  // 同步外部 currentFrame 到 ref（用于暂停 seek）
  useEffect(() => { frameRef.current = currentFrame }, [currentFrame])

  // 根据帧号计算当前 clip 索引
  const getClipIndexAtFrame = useCallback((frame: number) => {
    for (let i = computedClips.length - 1; i >= 0; i--) {
      if (frame >= computedClips[i].startFrame) return i
    }
    return 0
  }, [computedClips])

  const currentClipIndex = getClipIndexAtFrame(currentFrame)

  // 用于 UI 显示的时间（播放时从 ref 读，不依赖 state 更新）
  const [displayTime, setDisplayTime] = useState(framesToTime(currentFrame, project.config.fps))
  const [displayProgress, setDisplayProgress] = useState(0)
  const [displayClipIndex, setDisplayClipIndex] = useState(0)

  // 暂停时同步显示
  useEffect(() => {
    if (!playing) {
      setDisplayTime(framesToTime(currentFrame, project.config.fps))
      setDisplayProgress(totalDuration > 0 ? currentFrame / totalDuration : 0)
      setDisplayClipIndex(getClipIndexAtFrame(currentFrame))
    }
  }, [currentFrame, playing, project.config.fps, totalDuration, getClipIndexAtFrame])

  // 预加载所有视频
  useEffect(() => {
    computedClips.forEach(clip => {
      if (!videoCacheManager.has(clip.src)) {
        preloadVideo(clip.src).catch(() => {})
      }
    })
  }, [computedClips, preloadVideo])

  // 播放引擎：用 ref 驱动，不触发 React 重渲染
  useEffect(() => {
    if (!playing) {
      // 暂停：停止所有视频，seek 到精确位置
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const clipIdx = getClipIndexAtFrame(frameRef.current)
      const clip = computedClips[clipIdx]
      if (clip) {
        const video = videoRefs.current.get(clip.src)
        if (video) {
          video.pause()
          video.currentTime = Math.max(0, (frameRef.current - clip.startFrame) / project.config.fps)
        }
      }
      return
    }

    // 播放开始
    const fps = project.config.fps
    let prevClipIdx = getClipIndexAtFrame(frameRef.current)
    const startClip = computedClips[prevClipIdx]
    if (startClip) {
      const video = videoRefs.current.get(startClip.src)
      if (video) {
        video.currentTime = Math.max(0, (frameRef.current - startClip.startFrame) / fps)
        video.play().catch(() => {})
      }
    }

    let lastTs: number | null = null
    // UI 更新节流：每 ~100ms 更新一次显示
    let lastUiUpdate = 0

    const tick = (timestamp: number) => {
      if (lastTs === null) lastTs = timestamp
      const elapsed = (timestamp - lastTs) / 1000
      lastTs = timestamp

      const framesToAdd = Math.round(elapsed * fps)
      if (framesToAdd > 0) {
        frameRef.current += framesToAdd

        if (frameRef.current >= totalDuration) {
          // 播放到末尾
          frameRef.current = 0
          onFrameChange(0)
          onPlayPause()
          return
        }

        // 检查是否需要切换 clip
        const newClipIdx = getClipIndexAtFrame(frameRef.current)
        if (newClipIdx !== prevClipIdx) {
          const oldClip = computedClips[prevClipIdx]
          if (oldClip) videoRefs.current.get(oldClip.src)?.pause()
          const newClip = computedClips[newClipIdx]
          if (newClip) {
            const video = videoRefs.current.get(newClip.src)
            if (video) {
              video.currentTime = Math.max(0, (frameRef.current - newClip.startFrame) / fps)
              video.play().catch(() => {})
            }
          }
          prevClipIdx = newClipIdx
        }

        // 节流 UI 更新：~100ms 一次
        if (timestamp - lastUiUpdate > 100) {
          lastUiUpdate = timestamp
          setDisplayTime(framesToTime(frameRef.current, fps))
          setDisplayProgress(totalDuration > 0 ? frameRef.current / totalDuration : 0)
          setDisplayClipIndex(newClipIdx)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // 停止时同步 state
      onFrameChange(frameRef.current)
    }
  // 仅依赖 playing 变化来启停播放循环
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // 暂停时手动 seek 同步 video 元素
  useEffect(() => {
    if (playing) return
    const clip = computedClips[currentClipIndex]
    const video = clip ? videoRefs.current.get(clip.src) : undefined
    if (video) {
      video.currentTime = Math.max(0, (currentFrame - clip.startFrame) / project.config.fps)
    }
  }, [currentFrame, playing, currentClipIndex, computedClips, project.config.fps])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(Math.round(ratio * totalDuration))
  }, [totalDuration, onSeek])

  // 播放时用 displayClipIndex，暂停时用 currentClipIndex
  const visibleClipIndex = playing ? displayClipIndex : currentClipIndex

  if (project.timeline.length === 0) {
    return (
      <div className="w-full aspect-video max-h-[65vh] rounded-xl glass-surface flex items-center justify-center">
        <div className="text-center text-[var(--glass-text-tertiary)]">
          <AppIcon name="image" className="w-12 h-12 mx-auto mb-3" />
          <span className="text-sm">{t('editor.preview.emptyStartEditing')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 视频画面 */}
      <div className="relative w-full aspect-video max-h-[65vh] rounded-xl overflow-hidden bg-black">
        {computedClips.map((clip, index) => {
          const cached = videoCacheManager.get(clip.src)
          const poster = cached?.thumbnail || clip.metadata?.imageUrl || undefined
          return (
            <video
              key={clip.id}
              ref={el => {
                if (el) videoRefs.current.set(clip.src, el)
              }}
              src={clip.src}
              poster={poster}
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200"
              style={{ opacity: index === visibleClipIndex ? 1 : 0 }}
              preload="auto"
              muted
              playsInline
            />
          )
        })}
      </div>

      {/* 播放控制条 */}
      <div className="flex items-center gap-3 px-2">
        <button
          onClick={onPlayPause}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200"
          style={{ background: 'var(--glass-accent-from)', color: 'var(--glass-text-on-accent)' }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <AppIcon name={playing ? 'pause' : 'play'} className="w-5 h-5" />
        </button>

        <span className="text-xs text-[var(--glass-text-secondary)] font-mono tabular-nums whitespace-nowrap">
          {playing ? displayTime : framesToTime(currentFrame, project.config.fps)} / {totalTime}
        </span>

        <div
          className="flex-1 h-1.5 rounded-full cursor-pointer"
          style={{ background: 'var(--glass-stroke-base)' }}
          onClick={handleProgressClick}
        >
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${playing ? displayProgress * 100 : (totalDuration > 0 ? (currentFrame / totalDuration) * 100 : 0)}%`,
              background: 'var(--glass-accent-from)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// EditorTransitionNode
// ============================================================

function EditorTransitionNode({
  transition,
  onChange,
}: {
  transition?: ClipTransition
  onChange: (type: TransitionType, duration: number) => void
}) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('video')
  const type = transition?.type || 'none'

  const iconMap: Record<string, string> = {
    none: 'minus',
    dissolve: 'diamond',
    fade: 'clock',
    slide: 'arrowRight',
  }

  return (
    <div className="relative flex items-center shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-200 hover:scale-110"
        style={{
          background: type !== 'none' ? 'var(--glass-accent-from)' : 'var(--glass-bg-surface-strong)',
          borderColor: type !== 'none' ? 'var(--glass-stroke-focus)' : 'var(--glass-stroke-base)',
          color: type !== 'none' ? 'var(--glass-text-on-accent)' : 'var(--glass-text-tertiary)',
        }}
        title={t(`editor.transition.options.${type}`)}
      >
        <AppIcon name={iconMap[type] as 'minus'} className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-56">
            <TransitionPicker
              value={type}
              duration={transition?.durationInFrames || 15}
              onChange={(newType, newDuration) => {
                onChange(newType, newDuration)
                setOpen(false)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// EditorClipCard (Sortable)
// ============================================================

function EditorClipCard({
  clip,
  index,
  isSelected,
  onSelect,
  onTransitionChange,
  isLast,
}: {
  clip: VideoClip
  index: number
  isSelected: boolean
  onSelect: () => void
  onTransitionChange: (type: TransitionType, duration: number) => void
  isLast: boolean
}) {
  const t = useTranslations('video')
  const { getThumbnail } = useVideoPreload()
  const thumbnail = getThumbnail(clip.src) ?? clip.metadata?.imageUrl
  const duration = framesToTime(clip.durationInFrames, 30)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`shrink-0 w-36 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 select-none ${
          isDragging ? 'opacity-50 scale-95' : ''
        } ${
          isSelected
            ? 'ring-2 ring-[var(--glass-accent-from)] shadow-lg'
            : 'hover:ring-1 hover:ring-[var(--glass-stroke-focus)]'
        }`}
        onClick={onSelect}
        {...attributes}
        {...listeners}
      >
        {/* 缩略图 */}
        <div className="relative aspect-video bg-[var(--glass-bg-muted)]">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={clip.metadata?.description || `${t('editor.right.clipFallback', { index: index + 1 })}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--glass-text-tertiary)]">
              <AppIcon name="image" className="w-6 h-6" />
            </div>
          )}
          {/* 序号角标 */}
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white">
            {index + 1}
          </span>
        </div>

        {/* 底部信息 */}
        <div className="px-2 py-1.5 glass-surface">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--glass-text-secondary)] truncate">
              {clip.metadata?.description || t('editor.right.clipFallback', { index: index + 1 })}
            </span>
          </div>
          <span className="text-[10px] text-[var(--glass-text-tertiary)] font-mono tabular-nums">
            {duration}
          </span>
        </div>
      </div>

      {/* 转场节点 */}
      {!isLast && (
        <EditorTransitionNode
          transition={clip.transition}
          onChange={onTransitionChange}
        />
      )}
    </>
  )
}

// ============================================================
// EditorTrack
// ============================================================

function EditorTrack({
  clips,
  selectedClipId,
  onSelectClip,
  onReorder,
  onUpdateClipTransition,
}: {
  clips: VideoClip[]
  selectedClipId: string | null
  onSelectClip: (id: string) => void
  onReorder: (from: number, to: number) => void
  onUpdateClipTransition: (clipId: string, type: TransitionType, duration: number) => void
}) {
  const t = useTranslations('video')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = clips.findIndex(c => c.id === active.id)
    const newIndex = clips.findIndex(c => c.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex)
    }
  }, [clips, onReorder])

  if (clips.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--glass-text-tertiary)]">
        <AppIcon name="film" className="w-5 h-5 mr-2" />
        <span className="text-sm">{t('editor.preview.emptyStartEditing')}</span>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clips.map(c => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-2 overflow-x-auto py-4 px-4 scrollbar-thin">
          {clips.map((clip, index) => (
            <EditorClipCard
              key={clip.id}
              clip={clip}
              index={index}
              isSelected={selectedClipId === clip.id}
              onSelect={() => onSelectClip(clip.id)}
              onTransitionChange={(type, dur) => onUpdateClipTransition(clip.id, type, dur)}
              isLast={index === clips.length - 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ============================================================
// VideoEditorPageContent (内部组件，消费 preload context)
// ============================================================

// ============================================================
// EditorLoadingSkeleton
// ============================================================

function EditorLoadingSkeleton({ progress, total }: { progress: number; total: number }) {
  const t = useTranslations('video')
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="glass-page flex flex-col h-screen overflow-hidden">
      {/* 工具栏骨架 */}
      <div className="flex items-center gap-3 px-4 py-3 glass-surface border-b border-[var(--glass-stroke-base)]">
        <div className="h-9 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
        <div className="flex-1" />
        <div className="h-9 w-24 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* 预览区骨架 */}
        <div className="w-full max-w-5xl aspect-video rounded-xl bg-[var(--glass-bg-muted)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <AppIcon name="loader" className="w-10 h-10 animate-spin text-[var(--glass-accent-from)]" />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-[var(--glass-text-secondary)]">
                {pct}%
              </span>
            </div>
            <p className="text-sm text-[var(--glass-text-secondary)]">
              {t('editor.loading.preparing')}
            </p>
            <p className="text-xs text-[var(--glass-text-tertiary)]">
              {t('editor.loading.progress', { loaded: progress, total })}
            </p>
          </div>
        </div>

        {/* 卡片轨道骨架 */}
        <div className="w-full max-w-5xl glass-surface rounded-xl border border-[var(--glass-stroke-base)] px-4 py-4">
          <div className="flex items-center gap-3">
            {Array.from({ length: Math.min(total || 3, 6) }, (_, i) => (
              <div key={i} className="shrink-0 w-36 rounded-xl overflow-hidden">
                <div className="aspect-video bg-[var(--glass-bg-muted)] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                <div className="px-2 py-1.5 glass-surface">
                  <div className="h-3 w-2/3 bg-[var(--glass-bg-muted)] rounded animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// VideoEditorPageContent
// ============================================================

function VideoEditorPageContent({
  projectId,
  episodeId,
  initialProject,
  onBack,
}: {
  projectId: string
  episodeId: string
  initialProject?: VideoEditorProject
  onBack?: () => void
}) {
  const t = useTranslations('video')
  const [isSaving, setIsSaving] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })

  const {
    project,
    timelineState,
    isDirty,
    reorderClips,
    updateClip,
    play,
    pause,
    seek,
    selectClip,
    markSaved,
    seekToClipByPanelId,
  } = useEditorState({ episodeId, initialProject })

  const { saveProject } = useEditorActions({ projectId, episodeId })
  const { preloadVideo } = useVideoPreload()

  // 预加载所有视频，完成后进入就绪状态
  useEffect(() => {
    const clips = project.timeline
    if (clips.length === 0) return // 空 timeline 时等待数据加载，不急于设 ready

    // timeline 变化时重置加载状态
    setIsReady(false)
    setLoadProgress({ loaded: 0, total: clips.length })
    let loadedCount = 0
    let cancelled = false

    const loadAll = async () => {
      const promises = clips.map(async (clip) => {
        try {
          if (!videoCacheManager.has(clip.src)) {
            await preloadVideo(clip.src)
          }
        } catch { /* ignore individual failures */ }
        if (cancelled) return
        loadedCount++
        setLoadProgress({ loaded: loadedCount, total: clips.length })
      })

      await Promise.all(promises)
      if (!cancelled) setIsReady(true)
    }

    void loadAll()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.timeline])

  const handlePlayPause = useCallback(() => {
    if (timelineState.playing) pause()
    else play()
  }, [timelineState.playing, play, pause])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await saveProject(project)
      markSaved()
    } catch (error) {
      _ulogError('Save failed:', error)
      alert(t('editor.alert.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }, [saveProject, project, markSaved, t])

  const handleSelectClip = useCallback((clipId: string) => {
    selectClip(clipId)
    const computed = computeClipPositions(project.timeline)
    const target = computed.find(c => c.id === clipId)
    if (target) {
      seek(target.startFrame)
    }
  }, [selectClip, seek, project.timeline])

  const handleUpdateTransition = useCallback((clipId: string, type: TransitionType, duration: number) => {
    updateClip(clipId, {
      transition: type === 'none' ? undefined : { type, durationInFrames: duration },
    })
  }, [updateClip])

  // 加载中显示骨架屏
  if (!isReady) {
    return <EditorLoadingSkeleton progress={loadProgress.loaded} total={loadProgress.total} />
  }

  return (
    <div className="glass-page flex flex-col h-screen overflow-hidden animate-[fadeIn_0.3s_ease-out]">
      <EditorToolbar
        clipCount={project.timeline.length}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={() => void handleSave()}
        onBack={() => onBack?.()}
      />

      <div className="flex-1 flex flex-col overflow-hidden px-4 py-4 gap-4">
        {/* 预览区 */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="w-full max-w-5xl">
            <EditorPreview
              project={project}
              currentFrame={timelineState.currentFrame}
              playing={timelineState.playing}
              onFrameChange={seek}
              onPlayPause={handlePlayPause}
              onSeek={seek}
            />
          </div>
        </div>

        {/* 卡片轨道 */}
        <div className="shrink-0 glass-surface rounded-xl border border-[var(--glass-stroke-base)]">
          <EditorTrack
            clips={project.timeline}
            selectedClipId={timelineState.selectedClipId}
            onSelectClip={handleSelectClip}
            onReorder={reorderClips}
            onUpdateClipTransition={handleUpdateTransition}
          />
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ============================================================
// VideoEditorPage (公共导出)
// ============================================================

interface VideoEditorPageProps {
  projectId: string
  episodeId: string
  initialProject?: VideoEditorProject
  onBack?: () => void
}

export function VideoEditorPage({
  projectId,
  episodeId,
  initialProject,
  onBack,
}: VideoEditorPageProps) {
  return (
    <VideoPreloadProvider>
      <VideoEditorPageContent
        projectId={projectId}
        episodeId={episodeId}
        initialProject={initialProject}
        onBack={onBack}
      />
    </VideoPreloadProvider>
  )
}

export default VideoEditorPage
