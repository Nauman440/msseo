'use client';

import { useState } from 'react';
import { cn } from '@/lib/tones';
import { SIGNUP_INPUT, SIGNUP_LABEL } from './styles';

/** Password with "Show" and a 4-bar strength hint (design: "At least 8 characters"). */
export function PasswordField() {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const strength = Math.min(4, (value.length >= 8 ? 1 : 0) + (value.length >= 12 ? 1 : 0) + (/[A-Z]/.test(value) && /[a-z]/.test(value) ? 1 : 0) + (/[\d\W]/.test(value) ? 1 : 0));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="signup-password" className={SIGNUP_LABEL}>Password</label>
      <div className="relative">
        <input
          id="signup-password"
          name="password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby="signup-password-hint"
          className={cn(SIGNUP_INPUT, 'pr-20')}
        />
        <button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 px-3 text-sm font-bold text-primary-text">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className="flex items-center gap-2" id="signup-password-hint">
        <div className="flex gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn('h-1 w-9 rounded-bar', i <= strength ? (strength >= 3 ? 'bg-chart-pass' : 'bg-primary') : 'bg-border')} />
          ))}
        </div>
        <span className="text-[13px] text-ink-3">At least 8 characters</span>
      </div>
    </div>
  );
}
