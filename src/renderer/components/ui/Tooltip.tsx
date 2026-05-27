import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: string;
  shortcut?: string | undefined;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

export const Tooltip = ({
  label,
  shortcut,
  placement = 'top',
  children,
}: TooltipProps): JSX.Element => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    if (placement === 'top') {
      top = triggerRect.top - tooltipRect.height - 8;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    } else if (placement === 'right') {
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.right + 8;
    } else if (placement === 'bottom') {
      top = triggerRect.bottom + 8;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    } else {
      // left
      top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      left = triggerRect.left - tooltipRect.width - 8;
    }

    // Viewport collision containment (8px safety margin)
    if (left < 8) {
      left = 8;
    } else if (left + tooltipRect.width > viewportWidth - 8) {
      left = viewportWidth - tooltipRect.width - 8;
    }

    if (top < 8) {
      if (placement === 'top') {
        top = triggerRect.bottom + 8; // flip to bottom if clipping top
      } else {
        top = 8;
      }
    } else if (top + tooltipRect.height > viewportHeight - 8) {
      if (placement === 'bottom') {
        top = triggerRect.top - tooltipRect.height - 8; // flip to top if clipping bottom
      } else {
        top = viewportHeight - tooltipRect.height - 8;
      }
    }

    setCoords({ top, left });
  }, [visible, placement]);

  const tooltipNode = (
    <span
      ref={tooltipRef}
      role="tooltip"
      style={
        coords
          ? {
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              opacity: 1,
              pointerEvents: 'none',
            }
          : {
              position: 'fixed',
              top: -9999,
              left: -9999,
              opacity: 0,
              pointerEvents: 'none',
            }
      }
      className={[
        'z-[1000] max-w-[min(28rem,calc(100vw-16px))] whitespace-nowrap rounded border border-line bg-ink-950 px-2 py-1 text-[11px] text-readable shadow-panel transition-opacity duration-100',
        visible ? 'block' : 'hidden',
      ].join(' ')}
    >
      <span className="inline-block min-w-0 max-w-80 truncate align-bottom">{label}</span>
      {shortcut && <span className="ml-2 text-subtle">{shortcut}</span>}
    </span>
  );

  return (
    <span
      ref={triggerRef}
      onMouseEnter={() => setVisible(true)}
      onFocus={() => setVisible(true)}
      onMouseLeave={() => {
        setVisible(false);
        setCoords(null);
      }}
      onBlur={() => {
        setVisible(false);
        setCoords(null);
      }}
      className="inline-flex min-w-0"
    >
      {children}
      {createPortal(tooltipNode, document.body)}
    </span>
  );
};
