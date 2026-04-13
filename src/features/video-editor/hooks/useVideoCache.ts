interface CachedVideo {
  element: HTMLVideoElement
  thumbnail: string | null
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

class VideoCacheManager {
  private cache = new Map<string, CachedVideo>()
  private loadingStates = new Map<string, LoadingState>()

  get(src: string): CachedVideo | null {
    return this.cache.get(src) ?? null
  }

  set(src: string, entry: CachedVideo): void {
    this.cache.set(src, entry)
    this.loadingStates.set(src, 'loaded')
  }

  has(src: string): boolean {
    return this.cache.has(src)
  }

  getLoadingState(src: string): LoadingState {
    return this.loadingStates.get(src) ?? 'idle'
  }

  loadVideo(src: string): Promise<CachedVideo> {
    if (this.cache.has(src)) {
      return Promise.resolve(this.cache.get(src)!)
    }
    if (this.loadingStates.get(src) === 'loading') {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          const state = this.loadingStates.get(src)
          if (state === 'loaded') {
            clearInterval(check)
            resolve(this.cache.get(src)!)
          } else if (state === 'error' || state === 'idle') {
            clearInterval(check)
            reject(new Error(`Video load failed: ${src}`))
          }
        }, 100)
      })
    }

    this.loadingStates.set(src, 'loading')

    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = 'anonymous'
      video.src = src
      let settled = false

      const settle = () => {
        if (settled) return
        settled = true
        cleanup()
        let thumbnail: string | null = null
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 320
          canvas.height = video.videoHeight || 180
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            thumbnail = canvas.toDataURL('image/jpeg', 0.6)
          }
        } catch { /* ignore thumbnail errors */ }
        const entry: CachedVideo = { element: video, thumbnail }
        this.cache.set(src, entry)
        this.loadingStates.set(src, 'loaded')
        resolve(entry)
      }

      const onError = () => {
        if (settled) return
        settled = true
        cleanup()
        this.loadingStates.set(src, 'error')
        reject(new Error(`Video load failed: ${src}`))
      }

      const cleanup = () => {
        video.removeEventListener('loadeddata', settle)
        video.removeEventListener('canplaythrough', settle)
        video.removeEventListener('error', onError)
        clearTimeout(timeoutId)
      }

      // 首帧可用即视为就绪（解决并行加载时 canplaythrough 不触发的问题）
      video.addEventListener('loadeddata', settle, { once: true })
      // canplaythrough 作为加速路径，先触发的先赢
      video.addEventListener('canplaythrough', settle, { once: true })
      video.addEventListener('error', onError, { once: true })

      // 15 秒超时兜底：metadata 可用就算成功，否则报错
      const timeoutId = setTimeout(() => {
        if (settled) return
        if (video.readyState >= 1) {
          settle()
        } else {
          onError()
        }
      }, 15_000)

      video.load()
    })
  }

  delete(src: string): void {
    const entry = this.cache.get(src)
    if (entry) {
      entry.element.pause()
      entry.element.removeAttribute('src')
      entry.element.load()
      this.cache.delete(src)
    }
    this.loadingStates.delete(src)
  }

  clear(): void {
    for (const src of this.cache.keys()) {
      this.delete(src)
    }
  }
}

export const videoCacheManager = new VideoCacheManager()
