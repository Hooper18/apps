interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * iOS 分段控件：灰色轨道 + 白色滑块，用来在同一页的几个视图之间切换
 * （支出 / 收入 / 转账、统计页的几个标签）。
 *
 * 每一段仍然是普通 <button>、文字直接放在 button 里 —— 现有测试按
 * getByRole('button', { name }) / getByText 定位，别包 span、别改 role。
 * 选中状态用 aria-pressed 告诉读屏。
 */
export default function Segmented<T extends string>({ options, value, onChange, className = '' }: Props<T>) {
  return (
    <div className={`flex bg-gray-200/70 rounded-[11px] p-[3px] ${className}`}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 h-9 px-1 truncate rounded-lg text-[13px] leading-[18px] transition-colors ${
              selected
                ? 'bg-white text-gray-900 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                : 'text-gray-600 font-medium active:text-gray-900'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
