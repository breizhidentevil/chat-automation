import { useEffect, useRef, useState } from 'react';

export type RuntimeStatus = {
  phase: 'stopped' | 'ready' | 'waiting-interval' | 'waiting-window' | 'waiting-llm' | 'sending' | 'finished' | 'failed';
  note: string;
  messageIndex: number;
  messagesCount: number;
  completedSequences: number;
  repeatMode: 'infinite' | 'finite';
  repeatCount: number;
  nextSendAt: number | null;
  updatedAt: number;
};

export interface RuntimeStatusSnapshot {
  runtimeStatus: RuntimeStatus | null;
  clockNow: number;
}

/** Own the runtime status polling lifecycle and prevent updates after unmount. */
export function useRuntimeStatus(onReadError: () => void): RuntimeStatusSnapshot {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const onReadErrorRef = useRef(onReadError);
  const errorReported = useRef(false);

  useEffect(() => {
    onReadErrorRef.current = onReadError;
  }, [onReadError]);

  useEffect(() => {
    let mounted = true;
    const refreshRuntimeStatus = async () => {
      try {
        const data = await browser.storage.local.get('chatAutomationRuntimeStatus');
        errorReported.current = false;
        if (mounted) setRuntimeStatus((data.chatAutomationRuntimeStatus as RuntimeStatus | undefined) ?? null);
      } catch (error) {
        if (!errorReported.current) {
          console.error('[Chat Automation] Lecture de l’état d’exécution échouée.', error);
          if (mounted) onReadErrorRef.current();
          errorReported.current = true;
        }
      }
    };
    void refreshRuntimeStatus();
    const timer = window.setInterval(() => {
      if (mounted) setClockNow(Date.now());
      void refreshRuntimeStatus();
    }, 500);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return { runtimeStatus, clockNow };
}
