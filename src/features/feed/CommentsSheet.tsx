import { useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePostComments, useAddPostComment, type PostComment } from './usePostComments';

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return `${Math.floor(days / 7)} sem`;
}

function CommentRow({ comment }: { comment: PostComment }) {
  const name = comment.author.fullName || comment.author.username || 'Anônimo';
  return (
    <li className="flex gap-3">
      {comment.author.avatarUrl ? (
        <img
          src={comment.author.avatarUrl}
          alt={`Avatar de ${name}`}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-counter text-on-surface-variant"
          aria-hidden
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-sans text-body-sm font-semibold text-on-surface">{name}</span>
          {comment.author.username && (
            <span className="font-sans text-counter font-normal text-on-surface-variant">
              @{comment.author.username}
            </span>
          )}
          {comment.createdAt && (
            <span className="font-sans text-counter font-normal text-on-surface-variant">
              {relativeTime(comment.createdAt)}
            </span>
          )}
        </p>
        <p className="mt-0.5 break-words font-sans text-body text-on-surface">{comment.body}</p>
      </div>
    </li>
  );
}

interface CommentsSheetProps {
  postId: string | null;
  onClose: () => void;
}

export function CommentsSheet({ postId, onClose }: CommentsSheetProps) {
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = Boolean(postId);

  const { data: comments = [], isLoading, isError, refetch } = usePostComments(postId);
  const addComment = useAddPostComment(postId);

  // Limpa o composer ao fechar para a próxima abertura começar zerada.
  function handleClose() {
    setText('');
    setSendError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || addComment.isPending) return;
    setSendError(null);
    try {
      await addComment.mutateAsync(trimmed);
      setText('');
      inputRef.current?.focus();
    } catch (error) {
      setSendError(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível enviar. Tente novamente.',
      );
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={comments.length > 0 ? `Comentários (${comments.length})` : 'Comentários'}
      panelClassName="h-[60%]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin text-on-surface-variant" aria-label="Carregando comentários" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-sans text-body text-on-surface-variant">
                Não foi possível carregar os comentários.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="min-h-[40px] rounded-full border border-outline-variant/60 px-5 font-sans text-label text-on-surface"
              >
                Tentar novamente
              </button>
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center font-sans text-body text-on-surface-variant">
              Seja a primeira pessoa a comentar.
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} />
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-outline-variant/30 bg-background px-5 pb-4 pt-3"
        >
          {sendError && <p className="mb-2 font-sans text-body-sm text-error">{sendError}</p>}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Escreva um comentário..."
              maxLength={500}
              disabled={addComment.isPending}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface px-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              aria-label="Enviar comentário"
              disabled={!text.trim() || addComment.isPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-opacity disabled:opacity-40"
            >
              {addComment.isPending ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : (
                <Send size={18} aria-hidden />
              )}
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}
