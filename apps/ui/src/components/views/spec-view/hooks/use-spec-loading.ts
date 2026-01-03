import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';

export function useSpecLoading() {
  const { currentProject, setAppSpec } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [specExists, setSpecExists] = useState(true);

  const loadSpec = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      const result = await api.readFile(`${currentProject.path}/.automaker/app_spec.txt`);

      if (result.success && result.content) {
        setAppSpec(result.content);
        setSpecExists(true);
      } else {
        // File doesn't exist - treat as empty spec (still allow editing/analysis)
        setAppSpec('');
        setSpecExists(true); // Changed from false - allow editing empty spec
      }
    } catch (error) {
      console.error('Failed to load spec:', error);
      // Even on error, allow editing (treat as empty spec)
      setAppSpec('');
      setSpecExists(true); // Changed from false
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setAppSpec]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  return {
    isLoading,
    specExists,
    setSpecExists,
    loadSpec,
  };
}
