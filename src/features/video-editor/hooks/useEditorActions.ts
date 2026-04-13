'use client'

import { useCallback } from 'react'
import { VideoClip, VideoEditorProject } from '../types/editor.types'
import { apiFetch } from '@/lib/api-fetch'

interface UseEditorActionsProps {
    projectId: string
    episodeId: string
}

/**
 * 面板数据类型（灵活接受各种格式）
 */
interface PanelData {
    id?: string
    panelIndex?: number
    storyboardId: string
    videoUrl?: string
    imageUrl?: string
    lipSyncVideoUrl?: string
    description?: string
    duration?: number
}

interface VoiceLineData {
    id: string
    speaker: string
    content: string
    audioUrl?: string | null
    matchedStoryboardId?: string | null
    matchedPanelIndex?: number | null
}

/**
 * 从已生成的视频面板创建编辑器项目
 */
export function createProjectFromPanels(
    episodeId: string,
    panels: PanelData[],
    voiceLines?: VoiceLineData[]
): VideoEditorProject {
    // 构建 voice line 按 storyboardId+panelIndex 的索引
    const voiceLineMap = new Map<string, VoiceLineData>()
    if (voiceLines) {
        for (const vl of voiceLines) {
            if (vl.matchedStoryboardId != null && vl.matchedPanelIndex != null) {
                voiceLineMap.set(`${vl.matchedStoryboardId}-${vl.matchedPanelIndex}`, vl)
            }
        }
    }

    // 只保留有实际视频的面板（仅有图片的不加入时间轴）
    const usablePanels = panels.filter(p => p.videoUrl || p.lipSyncVideoUrl)

    const timeline: VideoClip[] = usablePanels.map((panel, index) => {
        // 按 storyboardId + panelIndex 匹配 voice line
        const panelKey = `${panel.storyboardId}-${panel.panelIndex ?? index}`
        const matchedVoice = voiceLineMap.get(panelKey)

        // 优先使用唇同步视频 → 普通视频
        const src = panel.lipSyncVideoUrl || panel.videoUrl || ''

        return {
            id: `clip_${panel.id || panel.storyboardId}_${panel.panelIndex ?? index}`,
            src,
            durationInFrames: Math.round((panel.duration || 3) * 30),
            attachment: {
                audio: matchedVoice?.audioUrl ? {
                    src: matchedVoice.audioUrl,
                    volume: 1,
                    voiceLineId: matchedVoice.id
                } : undefined,
                subtitle: matchedVoice ? {
                    text: matchedVoice.content,
                    style: 'default' as const
                } : undefined
            },
            transition: index < usablePanels.length - 1 ? {
                type: 'none' as const,
                durationInFrames: 0
            } : undefined,
            metadata: {
                panelId: panel.id || panelKey,
                storyboardId: panel.storyboardId,
                description: panel.description || undefined,
                imageUrl: panel.imageUrl || undefined,
                lipSyncVideoUrl: panel.lipSyncVideoUrl || undefined,
            }
        }
    })

    return {
        id: `editor_${episodeId}_${Date.now()}`,
        episodeId,
        schemaVersion: '1.0',
        config: {
            fps: 30,
            width: 1920,
            height: 1080
        },
        timeline,
        bgmTrack: []
    }
}

export function useEditorActions({ projectId, episodeId }: UseEditorActionsProps) {
    /**
     * 保存项目到服务器
     */
    const saveProject = useCallback(async (project: VideoEditorProject) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectData: project })
        })

        if (!response.ok) {
            throw new Error('Failed to save project')
        }

        return response.json()
    }, [projectId])

    /**
     * 加载项目
     */
    const loadProject = useCallback(async (): Promise<VideoEditorProject | null> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)

        if (!response.ok) {
            if (response.status === 404) return null
            throw new Error('Failed to load project')
        }

        const data = await response.json()
        return data.projectData
    }, [projectId, episodeId])

    /**
     * 发起渲染导出
     */
    const startRender = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editorProjectId,
                format: 'mp4',
                quality: 'high'
            })
        })

        if (!response.ok) {
            throw new Error('Failed to start render')
        }

        return response.json()
    }, [projectId])

    /**
     * 获取渲染状态
     */
    const getRenderStatus = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/render?id=${editorProjectId}`
        )

        if (!response.ok) {
            throw new Error('Failed to get render status')
        }

        return response.json()
    }, [projectId])

    return {
        saveProject,
        loadProject,
        startRender,
        getRenderStatus
    }
}
