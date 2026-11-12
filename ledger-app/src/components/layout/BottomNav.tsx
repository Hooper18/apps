import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Plus, CalendarDays, BarChart2, Settings } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

/**
 * 底部导航。按 HIG 的 Tab bars 一节：
 *  · 标签栏只负责在几个版块之间切换，不放操作 —— 所以"记一笔"不在栏里，
 *    而是栏旁边一个独立的圆形按钮；
 *  · iOS 上标签栏浮在内容上方、底下是玻璃材质，内容可以从下面滑过去；
 *  · 每个标签都带文字。
 */
export default function BottomNav() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const tabs = [
    { path: '/', label: t('navHome'), Icon: Home },
    { path: '/calendar', label: t('navCalendar'), Icon: CalendarDays },
    { path: '/charts', label: t('navStats'), Icon: BarChart2 },
    { path: '/settings', label: t('navSettings'), Icon: Settings },
  ]

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
      {/* 滚动边缘效果：内容滑到标签栏后面时逐渐模糊，保证栏上的字看得清 */}
      <div
        aria-hidden
        className="scroll-edge-bottom absolute inset-x-0 bottom-0"
        style={{ height: 'calc(var(--tabbar-h) + var(--tabbar-bottom) + 20px)' }}
      />

      <div
        className="relative flex items-center gap-2.5 px-4"
        style={{ paddingBottom: 'var(--tabbar-bottom)' }}
      >
        <nav className="glass shadow-glass pointer-events-auto flex-1 flex items-stretch p-1 rounded-full h-[58px]">
          {tabs.map(({ path, label, Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px] rounded-full transition-colors ${
                  isActive ? 'bg-black/[0.06] text-primary' : 'text-gray-500 active:bg-black/[0.04]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} />
                  <span className={`text-[11px] leading-[13px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => navigate('/add')}
          className="pointer-events-auto shrink-0 w-[58px] h-[58px] rounded-full bg-primary text-white flex items-center justify-center shadow-glass active:scale-95 active:bg-primary-dark transition-[transform,background-color] duration-150"
          aria-label={t('addTx')}
        >
          <Plus size={28} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
