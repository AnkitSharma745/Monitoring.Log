import { useEffect, useState } from 'react';

export const useCurrentTime = (intervalMs = 30_000): number => {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const updateCurrentTime = (): void => {
      setCurrentTime(Date.now());
    };

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs]);

  return currentTime;
};
