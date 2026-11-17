"use client";

import { useEffect, useReducer, useState } from "react";
import { CommitQueue, type CommitResult, type CommitStatus } from "./clipPanelLogic";

export interface CommitQueueHandle {
  schedule: (send: () => Promise<CommitResult>, delayMs: number) => void;
  status: CommitStatus;
  error: string | null;
  busy: boolean;
}

/**
 * One CommitQueue for the lifetime of the component. Anything still waiting
 * when the component unmounts (the user closed the panel straight after a
 * click) is sent rather than dropped.
 */
export function useCommitQueue(onCommitted: (r: CommitResult) => void): CommitQueueHandle {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [queue] = useState(() => new CommitQueue(() => bump()));
  useEffect(() => { queue.setOnCommitted(onCommitted); }, [queue, onCommitted]);
  useEffect(() => () => { void queue.flush(); queue.dispose(); }, [queue]);
  return {
    schedule: (send, delayMs) => queue.schedule(send, delayMs),
    status: queue.status,
    error: queue.error,
    busy: queue.busy,
  };
}
