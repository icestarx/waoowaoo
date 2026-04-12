'use client'

import { useMemo } from 'react'
import { VideoEditorStage } from '@/features/video-editor'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { createProjectFromPanels } from '@/features/video-editor'

interface StoryboardPanel {
  id: string
  storyboardId: string
  panelIndex?: number
  videoUrl?: string
  description?: string
  duration?: number
}

export default function EditorStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { storyboards, voiceLines } = useWorkspaceEpisodeStageData()

  const panels = useMemo(() => {
    const allPanels: StoryboardPanel[] = []
    for (const sb of storyboards) {
      if (sb.panels) {
        for (const panel of sb.panels) {
          allPanels.push({
            id: panel.id,
            storyboardId: sb.id,
            panelIndex: panel.panelIndex,
            videoUrl: panel.videoUrl ?? undefined,
            description: panel.description ?? undefined,
            duration: panel.duration ?? undefined,
          })
        }
      }
    }
    return allPanels
  }, [storyboards])

  const initialProject = useMemo(() => {
    return createProjectFromPanels(episodeId || '', panels, voiceLines)
  }, [episodeId, panels, voiceLines])
  if (!episodeId) return null

  return (
    <VideoEditorStage
      projectId={projectId}
      episodeId={episodeId}
      initialProject={initialProject}
      onBack={() => runtime.onStageChange('storyboard')}
    />
  )
}