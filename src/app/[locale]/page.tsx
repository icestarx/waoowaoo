'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'

export default function Home() {
  const t = useTranslations('landing')
  const { data: session, status } = useSession()
  const router = useRouter()

  // 已登录用户自动跳转到 home
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(buildAuthenticatedHomeTarget())
    }
  }, [status, router])

  // session 加载中或已登录（即将跳转），不渲染落地页，避免闪烁
  if (status !== 'unauthenticated') {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/logo-small.png?v=1"
            alt="waoowaoo"
            width={40}
            height={40}
            className="animate-pulse"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen overflow-hidden font-sans selection:bg-[var(--glass-tone-info-bg)]">
      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* 动态背景 */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* 基底渐变 */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(138,170,255,0.12),transparent),radial-gradient(900px_500px_at_0%_100%,rgba(148,163,184,0.16),transparent)]" />
        {/* 漂浮光斑 */}
        <div className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[100px]"
          style={{ top: '10%', left: '60%', background: 'radial-gradient(circle, rgba(99,102,241,0.4), transparent 70%)', animation: 'landing-orb-1 20s ease-in-out infinite' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-25 blur-[100px]"
          style={{ top: '50%', left: '10%', background: 'radial-gradient(circle, rgba(6,182,212,0.35), transparent 70%)', animation: 'landing-orb-2 25s ease-in-out infinite' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[80px]"
          style={{ top: '70%', left: '70%', background: 'radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)', animation: 'landing-orb-3 18s ease-in-out infinite' }} />
        {/* 网格纹理 */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(var(--glass-text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--glass-text-primary) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <style>{`
        @keyframes landing-orb-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-80px, 60px) scale(1.15); }
          66% { transform: translate(40px, -40px) scale(0.9); }
        }
        @keyframes landing-orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, -50px) scale(1.1); }
          66% { transform: translate(-30px, 30px) scale(0.95); }
        }
        @keyframes landing-orb-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, -40px) scale(1.2); }
        }
        @keyframes landing-title-glow {
          0%, 100% { filter: drop-shadow(0 0 20px rgba(99,102,241,0.15)); }
          50% { filter: drop-shadow(0 0 40px rgba(99,102,241,0.3)); }
        }
      `}</style>

      <main className="relative z-10">
        <section className="relative min-h-screen flex items-center justify-center -mt-16 px-4">
          <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-center">
            {/* 左侧文案 */}
            <div className="text-left space-y-8 animate-slide-up" style={{ animationDuration: '0.8s' }}>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] animate-fade-in" style={{ animationDelay: '0.2s', animation: 'fade-in 0.8s ease-out 0.2s both, landing-title-glow 6s ease-in-out infinite 1s' }}>
                <span className="block text-[var(--glass-text-primary)]">
                  {t('title')}
                </span>
                <span className="bg-gradient-to-r from-[var(--glass-tone-info-fg)] to-purple-400 bg-clip-text text-transparent">
                  {t('subtitle')}
                </span>
              </h1>

              <p className="text-lg text-[var(--glass-text-secondary)] max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {t('features.subtitle')}
              </p>

              {/* 特性标签 */}
              <div className="flex flex-wrap gap-3 animate-fade-in" style={{ animationDelay: '0.5s' }}>
                {(['character', 'storyboard', 'world'] as const).map((key, i) => (
                  <span key={key} className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] bg-[var(--glass-bg-surface)]"
                    style={{ animationDelay: `${0.5 + i * 0.1}s` }}>
                    {t(`features.${key}.title`)}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 pt-2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                <Link
                  href={{ pathname: '/auth/signup' }}
                  className="glass-btn-base glass-btn-primary px-8 py-4 rounded-xl font-semibold transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_30px_-8px_rgba(99,102,241,0.5)]"
                >
                  {t('getStarted')}
                </Link>
              </div>
            </div>

            {/* 右侧视觉区 */}
            <div className="relative h-[600px] hidden lg:flex items-center justify-center animate-scale-in" style={{ animationDuration: '1s' }}>
              <div className="relative w-full max-w-md aspect-square">
                {/* 光晕底座 */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle,rgba(99,102,241,0.15),transparent_65%)] rounded-full blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '4s' }} />

                {/* 浮动卡片 - 后层 */}
                <div className="absolute top-0 right-10 w-64 h-80 glass-surface rounded-3xl transform rotate-6 animate-float-delayed border border-[var(--glass-stroke-soft)]" />
                <div className="absolute bottom-10 left-10 w-72 h-80 glass-surface-soft rounded-3xl transform -rotate-3 animate-float-slow border border-[var(--glass-stroke-soft)]" />

                {/* 主卡片 */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-96 glass-surface-modal rounded-3xl overflow-hidden animate-float shadow-2xl">
                  <div className="p-6 h-full flex flex-col">
                    {/* 模拟视频预览区 */}
                    <div className="w-full h-48 bg-gradient-to-br from-[var(--glass-bg-muted)] to-[var(--glass-tone-info-bg)]/30 rounded-2xl mb-6 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-[var(--glass-tone-info-bg)]/10 group-hover:bg-[var(--glass-tone-info-bg)]/25 transition-colors duration-500" />
                      {/* 播放按钮装饰 */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                        <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-white/80 ml-1" />
                      </div>
                      {/* 时间轴装饰线 */}
                      <div className="absolute bottom-3 left-4 right-4 flex gap-1">
                        <div className="h-1 flex-[3] rounded-full bg-white/30" />
                        <div className="h-1 flex-[2] rounded-full bg-white/15" />
                        <div className="h-1 flex-[4] rounded-full bg-white/15" />
                      </div>
                    </div>
                    {/* 模拟文本行 */}
                    <div className="space-y-3">
                      <div className="h-3 w-3/4 bg-[var(--glass-bg-muted)] rounded-full" />
                      <div className="h-3 w-1/2 bg-[var(--glass-bg-muted)] rounded-full" />
                      <div className="pt-4 flex gap-2">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-[var(--glass-stroke-soft)]" />
                        <div className="h-10 flex-1 rounded-full bg-[var(--glass-tone-info-bg)]/30 border border-[var(--glass-stroke-base)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
