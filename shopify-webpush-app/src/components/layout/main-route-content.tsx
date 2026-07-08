'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { hasRouteWarmCache } from '@/lib/client/route-cache-ready';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { cn } from '@/lib/utils';

type OutgoingLayer = {
  path: string;
  node: ReactNode;
};

const MIN_INCOMING_HEIGHT = 96;
const COLD_MIN_HOLD_MS = 72;
const COLD_MAX_HOLD_MS = 360;

const waitForPaint = (callback: () => void) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
};

const incomingLooksReady = (element: HTMLElement | null) =>
  Boolean(element && element.offsetHeight >= MIN_INCOMING_HEIGHT);

/**
 * Outgoing page stays on top until the incoming route has painted underneath,
 * then fades out — no blank frame between routes when cache exists.
 */
export function MainRouteContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const incomingRef = useRef<HTMLDivElement>(null);
  const lastSnapshot = useRef<{ path: string; node: ReactNode }>({ path: pathname, node: children });
  const finishTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [displayNode, setDisplayNode] = useState(children);
  const [outgoing, setOutgoing] = useState<OutgoingLayer | null>(null);
  const [outgoingVisible, setOutgoingVisible] = useState(false);

  useLayoutEffect(() => {
    const clearTimers = () => {
      if (finishTimer.current != null) {
        window.clearTimeout(finishTimer.current);
        finishTimer.current = null;
      }
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    if (lastSnapshot.current.path === pathname) {
      if (lastSnapshot.current.node !== children) {
        setDisplayNode(children);
        lastSnapshot.current = { path: pathname, node: children };
      }
      return clearTimers;
    }

    const previous = lastSnapshot.current;
    const warm = hasRouteWarmCache(queryClient, shop, pathname);

    // Warm cache: swap instantly — no fade/hold overlay (avoids blink).
    if (warm) {
      setOutgoing(null);
      setOutgoingVisible(false);
      setDisplayNode(children);
      lastSnapshot.current = { path: pathname, node: children };
      return clearTimers;
    }

    const minHold = COLD_MIN_HOLD_MS;
    const maxHold = COLD_MAX_HOLD_MS;
    const startedAt = performance.now();

    setDisplayNode(children);
    setOutgoing({ path: previous.path, node: previous.node });
    setOutgoingVisible(true);
    lastSnapshot.current = { path: pathname, node: children };

    const finishTransition = () => {
      setOutgoingVisible(false);
      finishTimer.current = window.setTimeout(() => {
        setOutgoing(null);
      }, 150);
    };

    const pollReady = () => {
      const elapsed = performance.now() - startedAt;
      const ready = incomingLooksReady(incomingRef.current);

      if (ready && elapsed >= minHold) {
        finishTransition();
        return;
      }

      if (elapsed >= maxHold) {
        finishTransition();
        return;
      }

      rafRef.current = window.requestAnimationFrame(pollReady);
    };

    waitForPaint(pollReady);

    return clearTimers;
  }, [pathname, children, queryClient, shop]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-background">
      <div
        ref={incomingRef}
        className={cn(
          'relative z-[1] flex min-h-full flex-1 flex-col bg-background',
          outgoing ? 'pe-route-underlay' : 'pe-route-idle',
        )}
      >
        {displayNode}
      </div>

      {outgoing ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[2] flex min-h-full flex-col bg-background',
            outgoingVisible ? 'pe-route-outgoing-hold' : 'pe-route-outgoing-fade',
          )}
          aria-hidden={!outgoingVisible}
        >
          {outgoing.node}
        </div>
      ) : null}
    </div>
  );
}
