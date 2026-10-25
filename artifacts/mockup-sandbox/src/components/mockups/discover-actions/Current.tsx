import { Heart, Sparkles, Undo2, X } from 'lucide-react';
import './_group.css';

export function Current() {
  return (
    <main className="discover-action-preview">
      <div className="discover-action-preview-content">
        <div className="mx-auto mb-4 max-w-[620px] rounded-2xl border border-[#ded4f5] bg-white px-4 py-3 text-sm text-[#514177]" role="status" data-testid="status-swipe">
          This profile was already handled. Moving on.
          <button className="float-right font-bold" onClick={() => undefined} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
        <div className="discover-action-area" role="group" aria-label="Discover actions">
          <button type="button" className="discover-previous-button" disabled aria-label="Restore the previous passed profile" title="Previous" data-testid="button-discover-previous">
            <Undo2 size={19} aria-hidden="true" />
          </button>
          <button type="button" className="discover-action-button discover-action-pass" aria-label="Pass on Gay" title="Pass" data-testid="button-pass-preview">
            <X size={31} strokeWidth={2.1} aria-hidden="true" />
          </button>
          <button type="button" className="discover-action-button discover-action-super-like" aria-label="Super like Gay" title="Super Like · 100 $CHOG" data-testid="button-super-like-preview">
            <Sparkles size={27} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button type="button" className="discover-action-button discover-action-like" aria-label="Like Gay" title="Like" data-testid="button-like-preview">
            <Heart size={28} strokeWidth={1.9} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  );
}
