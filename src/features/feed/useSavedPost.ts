import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Posts salvos ficam locais por usuário (localStorage), como no onlyfit v1 —
// não existe tabela de salvos no banco ainda. Quando existir, este hook vira
// uma mutação Supabase sem mudar a interface.
function readSavedIds(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function useSavedPost(postId: string): { saved: boolean; toggleSaved: () => void } {
  const { session } = useAuth();
  const storageKey = `onlyfit.saved-posts.${session?.user.id ?? 'anon'}`;

  const [saved, setSaved] = useState(() => readSavedIds(storageKey).includes(postId));

  const toggleSaved = useCallback(() => {
    setSaved((wasSaved) => {
      const ids = new Set(readSavedIds(storageKey));
      if (wasSaved) ids.delete(postId);
      else ids.add(postId);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...ids]));
      } catch {
        // Sem storage disponível (modo privado): mantém só o estado da sessão.
      }
      return !wasSaved;
    });
  }, [postId, storageKey]);

  return { saved, toggleSaved };
}
