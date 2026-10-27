import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'

/**
 * Modal dialog to load a position from a FEN string.
 * Validation happens in the store (chess.js load), errors are shown inline.
 */
export const FenImportDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const loadFen = useGameStore((state) => state.loadFen)
  const currentFen = useGameStore((state) => state.fen)
  const [value, setValue] = useState(currentFen)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = () => {
    if (loadFen(value.trim())) {
      onClose()
    } else {
      setError('That position is not valid. Check the FEN and try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Load position from FEN"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-brass-600/40 bg-[#f4ecdd] p-6 shadow-lift dark:border-brass-400/40 dark:bg-walnut-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg uppercase tracking-[0.2em] text-brass-600 dark:text-brass-300">
          Load Position
        </h2>
        <p className="mt-1 text-xs italic text-ink-700 dark:text-cream-300">
          Paste a FEN to start from any position. The move history resets.
        </p>

        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          rows={3}
          spellCheck={false}
          className="mt-4 w-full resize-none border border-brass-600/40 bg-[#efe3c8] p-3 font-mono text-xs text-ink-900 focus:border-brass-500 focus:outline-none focus:ring-1 focus:ring-brass-500/40 dark:border-brass-400/40 dark:bg-walnut-800 dark:text-cream-100"
        />

        {error && <p className="mt-2 text-xs text-blood-500 dark:text-blood-300">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setValue(currentFen)}
            className="border border-brass-600/30 px-4 py-2 font-display text-xs uppercase tracking-[0.15em] text-ink-700 transition hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:text-cream-300 dark:hover:text-brass-300"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-brass-600/30 px-4 py-2 font-display text-xs uppercase tracking-[0.15em] text-ink-700 transition hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:text-cream-300 dark:hover:text-brass-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="border border-brass-600/50 bg-gradient-to-b from-brass-400 to-brass-600 px-5 py-2 font-display text-xs uppercase tracking-[0.15em] text-[#fff8ea] shadow-glow transition hover:from-brass-300 hover:to-brass-500 dark:border-brass-400/40 dark:from-brass-300 dark:to-brass-500 dark:text-walnut-950"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  )
}
