import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

export default function PasswordInput({
  value, onChange, placeholder, autoComplete,
  required, disabled, id, className,
}: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className={`relative${className ? ' ' + className : ''}`}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="w-full pl-4 pr-12 h-12 rounded-xl border border-transparent bg-gray-50 focus:outline-none focus:border-primary/40 text-base text-gray-900 placeholder:text-gray-400 transition-colors"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setShow(s => !s)}
        className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-gray-400 active:text-gray-600 transition-colors"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
