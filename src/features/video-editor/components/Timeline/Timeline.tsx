'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { VideoClip, TimelineState, EditorConfig } from '../../types/editor.types'
import { framesToTime } from '../../utils/time-utils'

interface TimelineProps {
    clips: VideoClip[]
    timelineState: TimelineState
    config: EditorConfig
    onReorder: (fromIndex: number, toIndex: number) => void
    onSelectClip: (clipId: string | null) => void
    onZoomChange: (zoom: number) => void
    onSeek?: (frame: number) => void
    getClipLoadState?: (clip: VideoClip) => 'idle' | 'loading' | 'loaded' | 'error'
    getClipThumbnail?: (clip: VideoClip) => string | undefined
}

export const Timeline: React.FC<TimelineProps> = ({
    clips,
    timelineState,
    config,
    onReorder,
    onSelectClip,
    onZoomChange,
    onSeek,
    getClipLoadState,
    getClipThumbnail
}) => {
    const t = useTranslations('video')
    const totalDuration = clips.reduce((sum, clip) => sum + clip.durationInFrames, 0)
    const currentFrame = timelineState?.currentFrame ?? 0
    const zoom = timelineState?.zoom ?? 1
    const selectedClipId = timelineState?.selectedClipId ?? null
    const playing = timelineState?.playing ?? false
    const playheadPosition = totalDuration > 0 ? (currentFrame / totalDuration) * 100 : 0
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = clips.findIndex(c => c.id === active.id)
            const newIndex = clips.findIndex(c => c.id === over.id)
            onReorder(oldIndex, newIndex)
        }
    }

    return (
        <div className="timeline" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: 'var(--glass-bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--glass-stroke-base)',
            height: '100%'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{ fontSize: '12px', color: 'var(--glass-text-secondary)' }}>{t('editor.timeline.zoomLabel')}</span>
                <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                    style={{ width: '100px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                    {Math.round(zoom * 100)}%
                </span>
            </div>

            <div
                style={{
                    position: 'relative',
                    height: '24px',
                    background: 'var(--glass-bg-muted)',
                    border: '1px solid var(--glass-stroke-base)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '70px'
                }}
                onClick={(e) => {
                    if (!onSeek || totalDuration === 0) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const percent = x / rect.width
                    const frame = Math.round(percent * totalDuration)
                    onSeek(Math.max(0, Math.min(totalDuration, frame)))
                }}
            >
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${playheadPosition}%`,
                    background: 'linear-gradient(90deg, var(--glass-accent-from) 0%, var(--glass-accent-to) 100%)',
                    borderRadius: '4px 0 0 4px',
                    transition: playing ? 'none' : 'width 0.1s'
                }} />
                <div style={{
                    position: 'absolute',
                    left: `${playheadPosition}%`,
                    top: '-4px',
                    bottom: '-4px',
                    width: '3px',
                    background: 'var(--glass-accent-to)',
                    borderRadius: '2px',
                    boxShadow: '0 0 8px var(--glass-accent-shadow-strong)',
                    transform: 'translateX(-50%)',
                    transition: playing ? 'none' : 'left 0.1s'
                }} />
                <div style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '10px',
                    color: 'var(--glass-text-tertiary)'
                }}>
                    {framesToTime(currentFrame, config.fps)} / {framesToTime(totalDuration, config.fps)}
                </div>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '56px',
                background: 'var(--glass-bg-surface-strong)',
                border: '1px solid var(--glass-stroke-base)',
                borderRadius: '6px',
                padding: '0 12px'
            }}>
                <span style={{
                    fontSize: '12px',
                    color: 'var(--glass-text-secondary)',
                    width: '70px',
                    flexShrink: 0
                }}>
                    {t('editor.timeline.videoTrack')}
                </span>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={clips.map(c => c.id)}
                        strategy={horizontalListSortingStrategy}
                    >
                        <div style={{
                            display: 'flex',
                            gap: '4px',
                            flex: 1,
                            overflowX: 'auto',
                            paddingRight: '12px'
                        }}>
                            {clips.map((clip, index) => (
                                <SortableClip
                                    key={clip.id}
                                    clip={clip}
                                    index={index}
                                    isSelected={selectedClipId === clip.id}
                                    zoom={zoom}
                                    fps={config.fps}
                                    onClick={() => onSelectClip(clip.id)}
                                    loadState={getClipLoadState?.(clip)}
                                    thumbnail={getClipThumbnail?.(clip)}
                                />
                            ))}
                            {clips.length === 0 && (
                                <span style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                                    {t('editor.timeline.emptyHint')}
                                </span>
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '32px',
                background: 'var(--glass-bg-surface-strong)',
                border: '1px solid var(--glass-stroke-base)',
                borderRadius: '6px',
                padding: '0 12px'
            }}>
                <span style={{
                    fontSize: '12px',
                    color: 'var(--glass-text-secondary)',
                    width: '70px',
                    flexShrink: 0
                }}>
                    {t('editor.timeline.audioTrack')}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--glass-text-tertiary)' }}>
                    {t('editor.timeline.audioBadge')}
                </span>
            </div>
        </div>
    )
}

interface SortableClipProps {
    clip: VideoClip
    index: number
    isSelected: boolean
    zoom: number
    fps: number
    onClick: () => void
    loadState?: 'idle' | 'loading' | 'loaded' | 'error'
    thumbnail?: string
}

const SortableClip: React.FC<SortableClipProps> = ({
    clip,
    index,
    isSelected,
    zoom,
    fps,
    onClick,
    loadState,
    thumbnail
}) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clip.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: 1
    }

    const width = Math.max(40, (clip.durationInFrames / fps) * 30 * zoom)

    const getLoadIndicator = () => {
        if (!loadState || loadState === 'loaded') return null

        const indicators = {
            idle: { color: '#6b7280', label: '等待' },
            loading: { color: '#f59e0b', label: '加载中' },
            error: { color: '#ef4444', label: '失败' }
        }

        const indicator = indicators[loadState]
        if (!indicator) return null

        return (
            <div style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: indicator.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                color: '#fff',
                fontWeight: 'bold'
            }}>
                {loadState === 'loading' && (
                    <div style={{
                        width: '8px',
                        height: '8px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                )}
                {loadState === 'error' && '!'}
            </div>
        )
    }

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                position: 'relative',
                width: `${width}px`,
                height: '40px',
                borderRadius: '6px',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: isSelected
                    ? '0 0 0 2px var(--glass-accent-from)'
                    : '0 1px 3px rgba(0,0,0,0.2)'
            }}
            {...attributes}
            {...listeners}
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
        >
            <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '6px',
                background: thumbnail
                    ? `url(${thumbnail}) center/cover no-repeat`
                    : isSelected
                        ? 'linear-gradient(135deg, var(--glass-accent-from) 0%, var(--glass-accent-to) 100%)'
                        : 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {!thumbnail && (
                    <span style={{
                        fontSize: '11px',
                        color: '#fff',
                        fontWeight: 500,
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                    }}>
                        {index + 1}
                    </span>
                )}

                {thumbnail && (
                    <span style={{
                        fontSize: '10px',
                        color: '#fff',
                        fontWeight: 500,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '2px 5px',
                        borderRadius: '3px'
                    }}>
                        {index + 1}
                    </span>
                )}

                {loadState === 'loaded' && (
                    <div style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#22c55e'
                    }} />
                )}

                {getLoadIndicator()}
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

export default Timeline